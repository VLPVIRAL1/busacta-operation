/**
 * Supabase Storage → SharePoint migration script.
 *
 * Usage:
 *   npx ts-node scripts/migrate-docs-to-sharepoint.ts [--dry-run]
 *
 * Execution plan:
 *   Pre-migration : Backup the full Supabase Storage bucket first.
 *   Dry run       : --dry-run flag logs all planned actions without writing anything.
 *   Pilot         : Run for 1 firm only to verify folder structure in SharePoint.
 *   Full run      : All firms; review the error log before proceeding to the next firm.
 *   Post-migration: Retain Supabase Storage files for 30 days, then delete the bucket.
 *
 * Requirements:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — set in .env
 *   microsoft_graph integration must be active and credentials saved in integration_credentials
 *   Each project must have sharepoint_drive_id set before migration can proceed for its tasks.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { uploadFile } from "../src/lib/sharepoint/upload";
import { graphFetch } from "../src/lib/sharepoint/graph-client.server";

const DRY_RUN = process.argv.includes("--dry-run");
const PILOT_FIRM_ID = process.argv.find((a) => a.startsWith("--firm="))?.split("=")[1];

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type DocRow = {
  id: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  sharepoint_item_id: string | null;
  task_id: string | null;
  project_id: string | null;
  firm_id: string | null;
  // Legacy Supabase Storage path (stored in migrated_from or a storage_path column)
  storage_path: string | null;
};

type TaskRow = {
  id: string;
  project_id: string | null;
  entity_id: string | null;
  title: string | null;
  slug: string | null;
  task_type_id: string | null;
  sharepoint_folder_id: string | null;
};

type ProjectRow = {
  id: string;
  firm_id: string | null;
  sharepoint_drive_id: string | null;
};

let totalSuccess = 0;
let totalSkip = 0;
let totalError = 0;

function log(level: "INFO" | "SKIP" | "ERROR" | "SUCCESS", msg: string) {
  const prefix = DRY_RUN ? "[DRY-RUN] " : "";
  console.log(`${prefix}[${level}] ${msg}`);
}

async function ensureTaskFolder(
  task: TaskRow,
  driveId: string,
  entityId?: string | null,
): Promise<string | null> {
  if (task.sharepoint_folder_id) return task.sharepoint_folder_id;

  const slug =
    task.slug ??
    task.title
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) ??
    task.id;
  // Task title only — no ID prefix. Sanitize SharePoint-invalid chars.
  const folderName =
    (task.title ?? slug)
      .replace(/["*:<>?/\\|]+/g, "-")
      .trim()
      .slice(0, 240) || "untitled";

  if (DRY_RUN) {
    log("INFO", `  Would create task folder: ${folderName}`);
    return `dry-run-folder-${task.id}`;
  }

  let folderId: string | null = null;
  try {
    const folder = await graphFetch<{
      id: string;
      webUrl: string;
      sharepointIds?: { listItemId?: string };
    }>({
      method: "POST",
      path: `/drives/${encodeURIComponent(driveId)}/items/root/children`,
      body: { name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "fail" },
    });
    folderId = folder.id;

    await supabase
      .from("tasks")
      .update({ sharepoint_folder_id: folder.id, sharepoint_folder_path: folderName })
      .eq("id", task.id);

    // Best-effort: set ClientName metadata on the folder list item
    if (entityId && folder.sharepointIds?.listItemId) {
      const { data: entityRaw } = await supabase
        .from("client_entities")
        .select("name")
        .eq("id", entityId)
        .maybeSingle();
      const clientName = (entityRaw as { name?: string } | null)?.name ?? "";
      if (clientName) {
        try {
          await graphFetch({
            method: "PATCH",
            path: `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folder.id)}/listItem/fields`,
            body: { ClientName: clientName },
          });
        } catch {
          // Column may not exist yet — non-fatal
        }
      }
    }
  } catch (e: unknown) {
    // 409 = folder already exists — find and return existing
    if (e instanceof Error && e.message.includes("409")) {
      const res = await graphFetch<{ value: Array<{ id: string }> }>({
        path: `/drives/${encodeURIComponent(driveId)}/root/children?$filter=${encodeURIComponent(`name eq '${folderName.replace(/'/g, "''")}'`)}&$select=id`,
      });
      const existingId = res.value?.[0]?.id;
      if (existingId) {
        folderId = existingId;
        await supabase
          .from("tasks")
          .update({ sharepoint_folder_id: existingId, sharepoint_folder_path: folderName })
          .eq("id", task.id);
      }
    } else throw e;
  }

  return folderId;
}

async function migrateDocument(doc: DocRow): Promise<void> {
  if (doc.sharepoint_item_id) {
    log("SKIP", `${doc.file_name} — already migrated`);
    totalSkip++;
    return;
  }

  if (!doc.storage_path) {
    log("SKIP", `${doc.file_name} — no storage_path, cannot download`);
    totalSkip++;
    return;
  }

  if (!doc.task_id) {
    log("SKIP", `${doc.file_name} — no task_id, cannot place in folder`);
    totalSkip++;
    return;
  }

  // Resolve task → project → drive
  const { data: taskRaw } = await supabase
    .from("tasks")
    .select("id, project_id, entity_id, title, slug, task_type_id, sharepoint_folder_id")
    .eq("id", doc.task_id)
    .maybeSingle();
  const task = taskRaw as TaskRow | null;

  if (!task?.project_id) {
    log("SKIP", `${doc.file_name} — task has no project_id`);
    totalSkip++;
    return;
  }

  const { data: projRaw } = await supabase
    .from("projects")
    .select("id, firm_id, sharepoint_drive_id")
    .eq("id", task.project_id)
    .maybeSingle();
  const project = projRaw as ProjectRow | null;

  if (!project?.sharepoint_drive_id) {
    log(
      "SKIP",
      `${doc.file_name} — project ${task.project_id} has no sharepoint_drive_id configured`,
    );
    totalSkip++;
    return;
  }

  if (DRY_RUN) {
    log(
      "INFO",
      `Would migrate: ${doc.file_name} → task folder in drive ${project.sharepoint_drive_id}`,
    );
    totalSuccess++;
    return;
  }

  // Download from Supabase Storage
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);
  if (dlErr || !fileData) {
    log("ERROR", `${doc.file_name} — download failed: ${dlErr?.message ?? "no data"}`);
    totalError++;
    return;
  }

  const fileBytes = await fileData.arrayBuffer();

  // Ensure task folder exists (creates it if missing)
  const folderId = await ensureTaskFolder(task, project.sharepoint_drive_id, task.entity_id);
  if (!folderId) {
    log("ERROR", `${doc.file_name} — could not create/find task folder`);
    totalError++;
    return;
  }

  // Upload to SharePoint
  const spFile = await uploadFile(
    project.sharepoint_drive_id,
    folderId,
    doc.file_name,
    fileBytes,
    doc.mime_type ?? "application/octet-stream",
  );

  // Update documents row with SharePoint metadata
  await supabase
    .from("documents")
    .update({
      sharepoint_item_id: spFile.id,
      sharepoint_url: spFile.downloadUrl,
      sharepoint_web_url: spFile.webUrl,
      migrated_from: "supabase-storage",
    })
    .eq("id", doc.id);

  log("SUCCESS", `${doc.file_name} → ${spFile.webUrl}`);
  totalSuccess++;
}

async function main() {
  log(
    "INFO",
    `Starting migration${DRY_RUN ? " (DRY RUN — no writes)" : ""}${PILOT_FIRM_ID ? ` for firm ${PILOT_FIRM_ID}` : " for all firms"}`,
  );

  // Load documents that haven't been migrated yet
  let query = supabase
    .from("documents")
    .select(
      "id, file_name, file_size_bytes, mime_type, sharepoint_item_id, task_id, project_id, firm_id, storage_path",
    )
    .is("sharepoint_item_id", null);

  if (PILOT_FIRM_ID) {
    query = query.eq("firm_id", PILOT_FIRM_ID);
  }

  const { data: docs, error } = await query;
  if (error) {
    console.error("Failed to load documents:", error.message);
    process.exit(1);
  }

  log("INFO", `Found ${docs?.length ?? 0} documents to migrate`);

  for (const doc of (docs ?? []) as DocRow[]) {
    try {
      await migrateDocument(doc);
    } catch (e: unknown) {
      log("ERROR", `${doc.file_name} — ${e instanceof Error ? e.message : String(e)}`);
      totalError++;
    }
  }

  console.log("\n=== Migration Summary ===");
  console.log(`  Success : ${totalSuccess}`);
  console.log(`  Skipped : ${totalSkip}`);
  console.log(`  Errors  : ${totalError}`);

  if (totalError > 0) {
    console.log("\nReview errors above before proceeding to the next firm.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
