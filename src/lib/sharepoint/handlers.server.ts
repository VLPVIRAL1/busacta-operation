// SharePoint job handlers — dispatched from the sync worker based on sharepoint_sync_jobs.job_type.
// All handlers are idempotent: they short-circuit when the target resource already exists.
//
// Hierarchy (post-integration):
//   B2B Firm → dedicated SharePoint site (manually created, URL pasted by admin)
//     └── Project Document Library (manually created, URL pasted by admin)
//          └── {slug}/  (auto-created on task save, files stored flat — no subfolders)
//               ClientName column set as folder metadata on the library list item
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  graphFetch,
  addSharePointListItem,
  upsertSharePointListItem,
  getOrCreateSharePointList,
} from "./graph-client.server";
import { TASK_COLUMNS, MESSAGE_COLUMNS, AUDIT_COLUMNS, DOCUMENT_COLUMNS } from "./list-columns";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

type Job = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  firm_id: string | null;
};

type DriveItem = {
  id: string;
  name?: string;
  webUrl?: string;
  parentReference?: { driveId?: string };
  sharepointIds?: { listItemId?: string };
};

const FOLDER_BODY = (name: string) => ({
  name,
  folder: {},
  "@microsoft.graph.conflictBehavior": "fail",
});

function sanitize(name: string): string {
  // SharePoint disallows: " * : < > ? / \ |  (and leading/trailing whitespace)
  return (
    name
      .replace(/["*:<>?/\\|]+/g, "-")
      .trim()
      .slice(0, 240) || "untitled"
  );
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function findChildByName(
  driveId: string,
  parentItemId: string,
  name: string,
): Promise<DriveItem | null> {
  const res = await graphFetch<{ value?: DriveItem[] }>({
    path: `/drives/${driveId}/items/${parentItemId}/children?$filter=${encodeURIComponent(`name eq '${name.replace(/'/g, "''")}'`)}&$select=id,name,webUrl,parentReference,sharepointIds`,
  });
  return res.value?.[0] ?? null;
}

async function createOrGetFolder(
  driveId: string,
  parentItemId: string,
  name: string,
): Promise<DriveItem> {
  try {
    return await graphFetch<DriveItem>({
      method: "POST",
      path: `/drives/${driveId}/items/${parentItemId}/children?$select=id,name,webUrl,parentReference,sharepointIds`,
      body: FOLDER_BODY(name),
    });
  } catch (e) {
    // 409 nameAlreadyExists → fetch the existing folder
    const existing = await findChildByName(driveId, parentItemId, name);
    if (existing) return existing;
    throw e;
  }
}

// ---------- ensureTaskIdColumn ----------
// Creates the BusAcTa_Task_ID custom text column on the Document Library list if absent.
// Idempotent — safe to call on every sync. Used for bidirectional task-folder mapping.
async function ensureTaskIdColumn(siteId: string, listId: string): Promise<void> {
  if (!siteId || !listId) return;
  const cols = await graphFetch<{ value: Array<{ name: string }> }>({
    path: `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/columns?$filter=${encodeURIComponent("name eq 'BusAcTa_Task_ID'")}&$select=name`,
  }).catch(() => ({ value: [] as Array<{ name: string }> }));
  if ((cols.value?.length ?? 0) > 0) return; // already exists
  await graphFetch({
    method: "POST",
    path: `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/columns`,
    body: {
      name: "BusAcTa_Task_ID",
      text: {},
      description: "BusAcTa internal task identifier for two-way sync",
    },
  });
}

// ---------- provision_site ----------
// Resolves the firm's SharePoint site URL to a site ID via Graph and stores it.
// The site itself must already exist (manually created in SharePoint Admin).
async function handleProvisionSite(job: Job): Promise<void> {
  const firmId = (job.payload.firm_id as string) ?? job.firm_id;
  if (!firmId) throw new Error("provision_site: firm_id missing");

  const { data: firmRaw, error: firmErr } = await supabaseAdmin
    .from("firms")
    .select("id, name, sharepoint_site_url")
    .eq("id", firmId)
    .maybeSingle();
  if (firmErr) throw new Error(firmErr.message);
  const firm = firmRaw as { id: string; name: string; sharepoint_site_url: string | null } | null;
  if (!firm) throw new Error(`Firm not found: ${firmId}`);
  if (!firm.sharepoint_site_url) {
    throw new Error(
      "No SharePoint site URL configured for this firm — admin must paste the URL in firm settings",
    );
  }

  await supabaseAdmin
    .from("firm_sharepoint_config" as never)
    .update({ provisioning_status: "provisioning", provisioning_error: null } as never)
    .eq("firm_id", firmId);

  // Parse e.g. "https://contoso.sharepoint.com/sites/SmithCPA"
  const url = new URL(firm.sharepoint_site_url);
  const hostname = url.hostname; // "contoso.sharepoint.com"
  const sitePath = url.pathname; // "/sites/SmithCPA"
  const siteRes = await graphFetch<{ id: string; webUrl: string }>({
    path: `/sites/${encodeURIComponent(hostname)}:${sitePath}?$select=id,webUrl`,
  });

  await supabaseAdmin
    .from("firm_sharepoint_config" as never)
    .update({
      sp_site_id: siteRes.id,
      sp_site_url: siteRes.webUrl,
      provisioning_status: "active",
      provisioning_error: null,
      provisioned_at: new Date().toISOString(),
    } as never)
    .eq("firm_id", firmId);

  await supabaseAdmin.from("document_nodes" as never).upsert(
    {
      firm_id: firmId,
      node_type: "firm_root",
      name: firm.name,
      sp_item_id: siteRes.id,
      sp_web_url: siteRes.webUrl,
      parent_node_id: null,
    } as never,
    { onConflict: "firm_id,sp_item_id" } as never,
  );

  // Fan-out any queued provision_project_library jobs for this firm now that the site is active
  await supabaseAdmin
    .from("sharepoint_sync_jobs" as never)
    .update({ status: "queued", next_run_at: new Date().toISOString() } as never)
    .eq("job_type", "provision_project_library")
    .eq("firm_id", firmId)
    .eq("status", "waiting_for_site");
}

// ---------- provision_project_library ----------
// Resolves the project's Document Library URL to drive_id + list_id via Graph and stores them.
// The library must already exist (manually created in SharePoint Admin).
async function handleProvisionProjectLibrary(job: Job): Promise<void> {
  const projectId = job.payload.project_id as string;
  if (!projectId) throw new Error("provision_project_library: project_id missing");

  const { data: projRaw, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id, firm_id, sharepoint_library_url")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  const project = projRaw as {
    id: string;
    firm_id: string | null;
    sharepoint_library_url: string | null;
  } | null;
  if (!project || !project.firm_id) throw new Error(`Project/firm not found: ${projectId}`);
  if (!project.sharepoint_library_url) {
    // No URL set yet — nothing to resolve; admin needs to paste the URL
    return;
  }

  // Check if firm site is provisioned; if not, park the job until it is
  const { data: firmCfgRaw } = await supabaseAdmin
    .from("firm_sharepoint_config" as never)
    .select("sp_site_id, provisioning_status")
    .eq("firm_id", project.firm_id)
    .maybeSingle();
  const firmCfg = firmCfgRaw as {
    sp_site_id: string | null;
    provisioning_status: string;
  } | null;
  if (!firmCfg?.sp_site_id) {
    // Park this job; handleProvisionSite will re-queue it when the site is ready
    await supabaseAdmin
      .from("sharepoint_sync_jobs" as never)
      .update({ status: "waiting_for_site" } as never)
      .eq("id", job.id);
    return;
  }

  const url = new URL(project.sharepoint_library_url);
  const hostname = url.hostname;
  const sitePath = url.pathname.split("/").slice(0, 3).join("/"); // e.g. "/sites/SmithCPA"

  // Verify we're on the right site
  const siteRes = await graphFetch<{ id: string }>({
    path: `/sites/${encodeURIComponent(hostname)}:${sitePath}?$select=id`,
  });

  // Enumerate drives on the firm's site and match by webUrl substring or name
  const librarySegment = url.pathname.split("/").pop() ?? "";
  const drivesRes = await graphFetch<{
    value: Array<{ id: string; name: string; webUrl: string }>;
  }>({
    path: `/sites/${encodeURIComponent(siteRes.id)}/drives?$select=id,name,webUrl`,
  });
  const drive = drivesRes.value.find(
    (d) =>
      d.webUrl.toLowerCase().includes(librarySegment.toLowerCase()) ||
      d.name.toLowerCase() === librarySegment.toLowerCase().replace(/-/g, " "),
  );
  if (!drive) {
    throw new Error(
      `Document Library not found on site. URL segment: "${librarySegment}". Available: ${drivesRes.value.map((d) => d.name).join(", ")}`,
    );
  }

  // Get the backing SharePoint list ID (needed for metadata patching)
  const driveInfo = await graphFetch<{ list?: { id: string } }>({
    path: `/drives/${encodeURIComponent(drive.id)}?$select=id,list`,
  });

  await supabaseAdmin
    .from("projects")
    .update({
      sharepoint_drive_id: drive.id,
      sharepoint_list_id: driveInfo.list?.id ?? null,
      sharepoint_site_id: firmCfg.sp_site_id,
    } as never)
    .eq("id", projectId);

  // Enqueue list provisioning now that the site ID is available.
  // Uses upsert with correlation_id so duplicate calls are no-ops.
  await enqueueProvisionProjectLists(projectId).catch(() => {});

  // Ensure BusAcTa_Task_ID column exists on the Document Library list (best-effort).
  try {
    if (firmCfg.sp_site_id && driveInfo.list?.id) {
      await ensureTaskIdColumn(firmCfg.sp_site_id, driveInfo.list.id);
    }
  } catch {
    /* non-fatal — will be retried by handleInitialSync */
  }

  // Enqueue initial sync to import all existing SharePoint files into the documents table.
  // Idempotent — correlation_id prevents duplicate jobs if called more than once.
  await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
    {
      job_type: "initial_sync",
      firm_id: project.firm_id,
      payload: { project_id: projectId },
      status: "queued",
      attempts: 0,
      max_attempts: 3,
      next_run_at: new Date().toISOString(),
      correlation_id: `initial-sync:${projectId}`,
    } as never,
    { onConflict: "correlation_id", ignoreDuplicates: true } as never,
  );

  // Best-effort: register a Graph change-notification subscription so file changes in
  // SharePoint reach BusAcTa within seconds (real-time sync). Non-fatal — the cron
  // worker will create/renew it on the next run if this call fails.
  try {
    await createOrRenewDriveSubscription(projectId, drive.id, null);
  } catch {
    /* non-fatal */
  }
}

// ---------- createOrRenewDriveSubscription ----------
// Exported so the cron worker can renew subscriptions approaching expiry.
// Creates a new subscription when existingSubId is null; renews via PATCH otherwise.
// Graph change-notification subscriptions expire after at most 30 days — we use 29
// to give the cron a comfortable renewal window.
export async function createOrRenewDriveSubscription(
  projectId: string,
  driveId: string,
  existingSubId: string | null,
): Promise<void> {
  const appOrigin = (process.env.APP_ORIGIN ?? process.env.PUBLIC_SITE_URL ?? "").replace(
    /\/$/,
    "",
  );
  if (!appOrigin) throw new Error("APP_ORIGIN / PUBLIC_SITE_URL env var not set");

  const notificationUrl = `${appOrigin}/api/public/sharepoint/webhook`;
  const expiresAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000); // 29 days

  if (existingSubId) {
    // Renew existing subscription — only expirationDateTime can be updated
    await graphFetch({
      method: "PATCH",
      path: `/subscriptions/${encodeURIComponent(existingSubId)}`,
      body: { expirationDateTime: expiresAt.toISOString() },
    });
  } else {
    // Create new subscription; Graph calls our webhook for create/update/delete events
    const sub = await graphFetch<{ id: string }>({
      method: "POST",
      path: "/subscriptions",
      body: {
        changeType: "created,updated,deleted",
        notificationUrl,
        resource: `/drives/${driveId}/root`,
        expirationDateTime: expiresAt.toISOString(),
        clientState: `busacta-drive-${projectId}`,
      },
    });
    await supabaseAdmin
      .from("projects")
      .update({ sharepoint_subscription_id: sub.id } as never)
      .eq("id", projectId);
  }

  await supabaseAdmin
    .from("projects")
    .update({ sharepoint_subscription_expires_at: expiresAt.toISOString() } as never)
    .eq("id", projectId);
}

// ---------- create_task_folder ----------
// Creates a folder in the project's Document Library named "{TASK_ID}: {slug}".
// Immediately followed by handleCreateTaskSubfolders to create template subfolders.
async function handleCreateTaskFolder(job: Job): Promise<void> {
  const taskId = job.payload.task_id as string;
  if (!taskId) throw new Error("create_task_folder: task_id missing");

  const { data: taskRaw, error: tErr } = await supabaseAdmin
    .from("tasks")
    .select("id, title, slug, task_type_id, project_id, entity_id, sharepoint_folder_id")
    .eq("id", taskId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  const task = taskRaw as {
    id: string;
    title: string | null;
    slug: string | null;
    task_type_id: string | null;
    project_id: string | null;
    entity_id: string | null;
    sharepoint_folder_id: string | null;
  } | null;
  if (!task) throw new Error(`Task not found: ${taskId}`);

  // Short-circuit if already created (idempotent)
  if (task.sharepoint_folder_id) return;

  if (!task.project_id) throw new Error("Task has no project_id — cannot locate Document Library");

  const { data: projRaw } = await supabaseAdmin
    .from("projects")
    .select("sharepoint_drive_id, sharepoint_site_id")
    .eq("id", task.project_id)
    .maybeSingle();
  const project = projRaw as {
    sharepoint_drive_id: string | null;
    sharepoint_site_id: string | null;
  } | null;
  if (!project?.sharepoint_drive_id) {
    throw new Error("Project Document Library not configured — will retry");
  }

  // Folder name: "{slug}" — task title only, no ID prefix, generated once
  const taskSlug = task.slug ?? toSlug(task.title ?? task.id);
  const folderName = sanitize(task.title ?? taskSlug).slice(0, 240);
  const driveId = project.sharepoint_drive_id;

  const folder = await createOrGetFolder(driveId, "root", folderName);

  // Persist folder ID to task row
  await supabaseAdmin
    .from("tasks")
    .update({
      sharepoint_folder_id: folder.id,
      sharepoint_folder_path: folderName,
    } as never)
    .eq("id", taskId);

  // Save the SharePoint list item ID so patch_task_metadata can update folder metadata fields
  if (folder.sharepointIds?.listItemId) {
    await supabaseAdmin.from("task_folder_metadata" as never).upsert(
      {
        task_id: taskId,
        sp_list_item_id: folder.sharepointIds.listItemId,
        sync_status: "pending",
      } as never,
      { onConflict: "task_id" } as never,
    );
  }

  // Also keep document_nodes in sync
  const firmId = task.entity_id;
  if (firmId) {
    await supabaseAdmin.from("document_nodes" as never).upsert(
      {
        firm_id: firmId,
        project_id: task.project_id,
        task_id: taskId,
        node_type: "task_folder",
        name: folderName,
        sp_item_id: folder.id,
        sp_list_item_id: folder.sharepointIds?.listItemId ?? null,
        sp_web_url: folder.webUrl ?? null,
      } as never,
      { onConflict: "firm_id,sp_item_id" } as never,
    );
  }

  // Set ClientName metadata on the folder list item (best-effort — non-fatal if column missing)
  if (task.entity_id && folder.sharepointIds?.listItemId) {
    const { data: entityRaw } = await supabaseAdmin
      .from("client_entities" as never)
      .select("name")
      .eq("id", task.entity_id)
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
        // Column may not exist yet on this library — non-fatal
      }
    }
  }
}

// ---------- create_task_subfolders (internal helper) ----------
// Priority order (highest to lowest):
//   1. Firm-specific + type-specific (firm_id = X, task_type_id = Y)
//   2. Firm-specific + any type     (firm_id = X, task_type_id IS NULL)
//   3. Global type-specific         (firm_id IS NULL, task_type_id = Y)
//   4. Global defaults              (firm_id IS NULL, task_type_id IS NULL) ← seeded in migration
async function createTaskSubfolders(
  taskId: string,
  taskTypeId: string | null,
  firmId: string | null,
  taskFolderId: string,
  driveId: string,
): Promise<void> {
  type FolderRow = { folder_name: string; sort_order: number };
  let rows: FolderRow[] | null = null;

  // Try progressively broader lookups until we find rows
  const attempts = [
    // firm-specific + type-specific
    firmId && taskTypeId
      ? supabaseAdmin
          .from("task_template_folders" as never)
          .select("folder_name, sort_order")
          .eq("firm_id", firmId)
          .eq("task_type_id", taskTypeId)
          .order("sort_order")
      : null,
    // firm-specific any type
    firmId
      ? supabaseAdmin
          .from("task_template_folders" as never)
          .select("folder_name, sort_order")
          .eq("firm_id", firmId)
          .is("task_type_id", null)
          .order("sort_order")
      : null,
    // global type-specific
    taskTypeId
      ? supabaseAdmin
          .from("task_template_folders" as never)
          .select("folder_name, sort_order")
          .is("firm_id", null)
          .eq("task_type_id", taskTypeId)
          .order("sort_order")
      : null,
    // global defaults (both null)
    supabaseAdmin
      .from("task_template_folders" as never)
      .select("folder_name, sort_order")
      .is("firm_id", null)
      .is("task_type_id", null)
      .order("sort_order"),
  ].filter(Boolean);

  for (const query of attempts) {
    const { data } = (await (query as any)) as { data: FolderRow[] | null; error: unknown };
    if (data && (data as FolderRow[]).length > 0) {
      rows = data as FolderRow[];
      break;
    }
  }

  for (const sf of rows ?? []) {
    const sfFolder = await createOrGetFolder(driveId, taskFolderId, sf.folder_name);
    await supabaseAdmin.from("task_folder_nodes" as never).upsert(
      {
        task_id: taskId,
        folder_name: sf.folder_name,
        sp_item_id: sfFolder.id,
        sp_web_url: sfFolder.webUrl ?? null,
      } as never,
      { onConflict: "task_id,sp_item_id" } as never,
    );
  }
}

// ---------- archive_task_folder ----------
// Moves the task's SharePoint folder to a #Delete folder within the project library.
// Triggered BEFORE DELETE on tasks (tasks are hard-deleted). The trigger captures
// project_id + sharepoint_folder_id into the job payload because the task row no
// longer exists by the time this worker runs.
async function handleArchiveTaskFolder(job: Job): Promise<void> {
  const taskId = job.payload.task_id as string;
  if (!taskId) throw new Error("archive_task_folder: task_id missing");

  const { data: taskRaw } = await supabaseAdmin
    .from("tasks")
    .select("id, project_id, sharepoint_folder_id")
    .eq("id", taskId)
    .maybeSingle();
  const task = taskRaw as {
    id: string;
    project_id: string | null;
    sharepoint_folder_id: string | null;
  } | null;

  // The task is normally already hard-deleted — fall back to the ids the trigger
  // captured in the job payload when the row is gone.
  const folderId =
    task?.sharepoint_folder_id ?? ((job.payload.sharepoint_folder_id as string | null) || null);
  const projectId = task?.project_id ?? ((job.payload.project_id as string | null) || null);

  // No folder was ever created — nothing to archive
  if (!folderId || !projectId) return;

  const { data: projRaw } = await supabaseAdmin
    .from("projects")
    .select("sharepoint_drive_id")
    .eq("id", projectId)
    .maybeSingle();
  const driveId = (projRaw as { sharepoint_drive_id: string | null } | null)?.sharepoint_drive_id;
  if (!driveId) return;

  // Find or create the #Delete folder at the root of the project library
  const deleteFolder = await createOrGetFolder(driveId, "root", "#Delete");

  // Move task folder into #Delete via PATCH parentReference
  await graphFetch({
    method: "PATCH",
    path: `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}`,
    body: { parentReference: { id: deleteFolder.id } },
  });

  // If the task row still exists (it usually won't after a hard delete), clear the
  // folder ID and log an audit node. Skipped when the task is already gone — the
  // task_folder_nodes FK would otherwise reject the orphaned reference.
  if (task) {
    await supabaseAdmin
      .from("tasks")
      .update({ sharepoint_folder_id: null } as never)
      .eq("id", taskId);

    await supabaseAdmin.from("task_folder_nodes" as never).insert({
      task_id: taskId,
      folder_name: "#archived",
      sp_item_id: folderId,
      sp_web_url: null,
    } as never);
  }
}

// ---------- initial_sync ----------
// Full scan of a project's Document Library — imports ALL existing SharePoint files
// into the documents table and seeds the delta link for future incremental syncs.
// Triggered automatically after provision_project_library and manually via admin "Sync Now".
// Idempotent — safe to run multiple times (upserts on sharepoint_item_id).
async function handleInitialSync(job: Job): Promise<void> {
  const projectId = job.payload.project_id as string;
  if (!projectId) throw new Error("initial_sync: project_id missing");

  const { data: projRaw } = await supabaseAdmin
    .from("projects")
    .select("id, firm_id, sharepoint_drive_id, sharepoint_list_id, sharepoint_site_id")
    .eq("id", projectId)
    .maybeSingle();
  const project = projRaw as {
    id: string;
    firm_id: string | null;
    sharepoint_drive_id: string | null;
    sharepoint_list_id: string | null;
    sharepoint_site_id: string | null;
  } | null;
  if (!project?.sharepoint_drive_id)
    throw new Error("initial_sync: Project Document Library not configured");

  const driveId = project.sharepoint_drive_id;
  const siteId = project.sharepoint_site_id ?? "";
  const listId = project.sharepoint_list_id ?? "";

  // Ensure BusAcTa_Task_ID column exists on the library list
  if (siteId && listId) await ensureTaskIdColumn(siteId, listId).catch(() => {});

  // Load all active tasks for this project
  type InitTaskRow = {
    id: string;
    title: string | null;
    slug: string | null;
    sharepoint_folder_id: string | null;
  };
  const { data: taskRows } = await supabaseAdmin
    .from("tasks")
    .select("id, title, slug, sharepoint_folder_id")
    .eq("project_id", projectId)
    .is("deleted_at", null);
  const tasks = (taskRows ?? []) as unknown as InitTaskRow[];

  // Map: SP folder ID → task ID (tasks already linked by a previous sync)
  const folderIdToTaskId = new Map<string, string>();
  for (const t of tasks) {
    if (t.sharepoint_folder_id) folderIdToTaskId.set(t.sharepoint_folder_id, t.id);
  }

  type FullDriveItem = {
    id: string;
    name?: string;
    size?: number;
    file?: { mimeType?: string };
    folder?: object;
    webUrl?: string;
    "@microsoft.graph.downloadUrl"?: string;
    listItem?: { id?: string; fields?: Record<string, unknown> };
  };

  // ── Paginate root-level items (task folders live here) ────────────────────
  const rootItems: FullDriveItem[] = [];
  let nextPath: string | undefined =
    `/drives/${encodeURIComponent(driveId)}/root/children?$expand=listItem($select=id,fields)&$select=id,name,file,folder,webUrl,size`;
  while (nextPath) {
    const page: { value: FullDriveItem[]; "@odata.nextLink"?: string } = await graphFetch<{
      value: FullDriveItem[];
      "@odata.nextLink"?: string;
    }>({
      path: nextPath,
    });
    rootItems.push(...(page.value ?? []));
    if (page["@odata.nextLink"]) {
      const u: URL = new URL(page["@odata.nextLink"]);
      nextPath = u.href.startsWith(GRAPH_BASE)
        ? u.href.slice(GRAPH_BASE.length)
        : u.pathname + u.search;
    } else {
      nextPath = undefined;
    }
  }

  // ── Map root folders → tasks (three strategies, in priority order) ─────────
  for (const folder of rootItems) {
    if (!folder.folder || folder.file || !folder.name) continue;
    if (folder.name === "#Delete") continue;
    if (folderIdToTaskId.has(folder.id)) continue; // already linked

    let taskId: string | null = null;

    // Strategy 1: BusAcTa_Task_ID already stamped on the list item
    const stamped = folder.listItem?.fields?.["BusAcTa_Task_ID"] as string | undefined;
    if (stamped) {
      const found = tasks.find((t) => t.id === stamped);
      if (found) taskId = found.id;
    }

    // Strategy 2: Parse "{TASK_ID}: " prefix from folder name
    if (!taskId) {
      const prefixMatch = folder.name.match(/^([A-Za-z0-9-]+):\s+/);
      if (prefixMatch) {
        const found = tasks.find((t) => t.id === prefixMatch[1]);
        if (found) taskId = found.id;
      }
    }

    // Strategy 3: Normalised name match (strips numeric prefixes, lowercases)
    if (!taskId) {
      const norm = normForFolderMatch(folder.name);
      const found = tasks.find((t) => {
        if (t.sharepoint_folder_id) return false; // already linked elsewhere
        const base = t.title ?? t.slug ?? "";
        return base !== "" && normForFolderMatch(base) === norm;
      });
      if (found) taskId = found.id;
    }

    if (!taskId) continue;

    await supabaseAdmin
      .from("tasks")
      .update({ sharepoint_folder_id: folder.id, sharepoint_folder_path: folder.name } as never)
      .eq("id", taskId)
      .is("sharepoint_folder_id", null);
    folderIdToTaskId.set(folder.id, taskId);

    // Stamp BusAcTa_Task_ID on folder list item (best-effort, fire-and-forget)
    if (siteId && listId && folder.listItem?.id && !stamped) {
      graphFetch({
        method: "PATCH",
        path: `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(folder.listItem.id)}/fields`,
        body: { BusAcTa_Task_ID: taskId },
      }).catch(() => {});
    }
  }

  // ── Collect files from every mapped task folder (recursive into subfolders) ─
  type FileWithTask = FullDriveItem & { taskId: string };
  const allFiles: FileWithTask[] = [];
  for (const folder of rootItems) {
    if (!folder.folder || !folder.name || folder.name === "#Delete") continue;
    const taskId = folderIdToTaskId.get(folder.id);
    if (!taskId) continue;
    const files = await collectFilesInFolder(driveId, folder.id);
    for (const f of files) allFiles.push({ ...f, taskId });
  }

  // ── Batch upsert documents (50 rows per statement) ─────────────────────────
  const BATCH = 50;
  for (let i = 0; i < allFiles.length; i += BATCH) {
    const batch = allFiles.slice(i, i + BATCH);
    await supabaseAdmin.from("documents" as never).upsert(
      batch.map((f) => ({
        task_id: f.taskId,
        project_id: projectId,
        firm_id: project.firm_id,
        file_name: f.name ?? "untitled",
        file_size_bytes: f.size ?? null,
        mime_type: f.file?.mimeType ?? null,
        sharepoint_item_id: f.id,
        sharepoint_url: f["@microsoft.graph.downloadUrl"] ?? "",
        sharepoint_web_url: f.webUrl ?? null,
        deleted_at: null,
      })) as never,
      { onConflict: "sharepoint_item_id" } as never,
    );
  }

  // ── Stamp BusAcTa_Task_ID on file list items (4 concurrent, Graph rate limit) ─
  if (siteId && listId) {
    const toStamp = allFiles.filter((f) => {
      const s = f.listItem?.fields?.["BusAcTa_Task_ID"] as string | undefined;
      return !s && !!f.listItem?.id;
    });
    for (let i = 0; i < toStamp.length; i += 4) {
      await Promise.allSettled(
        toStamp.slice(i, i + 4).map((f) =>
          graphFetch({
            method: "PATCH",
            path: `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(f.listItem!.id!)}/fields`,
            body: { BusAcTa_Task_ID: f.taskId },
          }),
        ),
      );
    }
  }

  // ── Seed delta link (token=latest returns empty set + deltaLink immediately) ─
  let deltaLink: string | null = null;
  try {
    let dp: string | undefined = `/drives/${encodeURIComponent(driveId)}/root/delta?token=latest`;
    while (dp) {
      const pg: { value?: unknown[]; "@odata.deltaLink"?: string; "@odata.nextLink"?: string } =
        await graphFetch<{
          value?: unknown[];
          "@odata.deltaLink"?: string;
          "@odata.nextLink"?: string;
        }>({ path: dp });
      if (pg["@odata.deltaLink"]) {
        deltaLink = pg["@odata.deltaLink"];
        break;
      }
      if (pg["@odata.nextLink"]) {
        const u: URL = new URL(pg["@odata.nextLink"]);
        dp = u.href.startsWith(GRAPH_BASE)
          ? u.href.slice(GRAPH_BASE.length)
          : u.pathname + u.search;
      } else {
        break;
      }
    }
  } catch {
    /* non-fatal — delta sync will fall back to full scan on next run */
  }

  await supabaseAdmin
    .from("projects")
    .update({
      sharepoint_initial_sync_done: true,
      sharepoint_delta_link: deltaLink,
      sharepoint_last_synced_at: new Date().toISOString(),
    } as never)
    .eq("id", projectId);
}

/** Recursively collects all files (not sub-folders) within a SharePoint folder. */
async function collectFilesInFolder(
  driveId: string,
  folderId: string,
): Promise<
  Array<{
    id: string;
    name?: string;
    size?: number;
    file?: { mimeType?: string };
    webUrl?: string;
    "@microsoft.graph.downloadUrl"?: string;
    listItem?: { id?: string; fields?: Record<string, unknown> };
  }>
> {
  type ChildItem = {
    id: string;
    name?: string;
    size?: number;
    file?: { mimeType?: string };
    folder?: object;
    webUrl?: string;
    "@microsoft.graph.downloadUrl"?: string;
    listItem?: { id?: string; fields?: Record<string, unknown> };
  };
  const results: ChildItem[] = [];
  let path: string | undefined =
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children?$expand=listItem($select=id,fields)&$select=id,name,file,folder,webUrl,size`;
  while (path) {
    const page: { value: ChildItem[]; "@odata.nextLink"?: string } = await graphFetch<{
      value: ChildItem[];
      "@odata.nextLink"?: string;
    }>({ path });
    for (const item of page.value ?? []) {
      if (item.file) {
        results.push(item);
      } else if (item.folder) {
        // Recurse into subfolders (Source Documents, Workpapers, Returns, …)
        const sub = await collectFilesInFolder(driveId, item.id);
        results.push(...sub);
      }
    }
    if (page["@odata.nextLink"]) {
      const u: URL = new URL(page["@odata.nextLink"]);
      path = u.href.startsWith(GRAPH_BASE)
        ? u.href.slice(GRAPH_BASE.length)
        : u.pathname + u.search;
    } else {
      path = undefined;
    }
  }
  return results;
}

// ---------- rename_task_folder ----------
// Renames the SharePoint task folder to match the updated task title.
// Triggered by trg_tasks_rename_sharepoint when tasks.title changes.
async function handleRenameTaskFolder(job: Job): Promise<void> {
  const taskId = job.payload.task_id as string;
  if (!taskId) throw new Error("rename_task_folder: task_id missing");

  const { data: taskRaw } = await supabaseAdmin
    .from("tasks")
    .select("id, title, slug, sharepoint_folder_id, project_id")
    .eq("id", taskId)
    .maybeSingle();
  const task = taskRaw as {
    id: string;
    title: string | null;
    slug: string | null;
    sharepoint_folder_id: string | null;
    project_id: string | null;
  } | null;
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (!task.sharepoint_folder_id) return; // no folder yet — no-op

  const { data: projRaw } = await supabaseAdmin
    .from("projects")
    .select("sharepoint_drive_id")
    .eq("id", task.project_id ?? "")
    .maybeSingle();
  const driveId = (projRaw as { sharepoint_drive_id: string | null } | null)?.sharepoint_drive_id;
  if (!driveId) return;

  const taskSlug = task.slug ?? toSlug(task.title ?? task.id);
  const newFolderName = sanitize(task.title ?? taskSlug).slice(0, 240);

  await graphFetch({
    method: "PATCH",
    path: `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(task.sharepoint_folder_id)}`,
    body: { name: newFolderName },
  });

  await supabaseAdmin
    .from("tasks")
    .update({ sharepoint_folder_path: newFolderName } as never)
    .eq("id", taskId);
}

// ---------- delete_sharepoint_file ----------
// Deletes a single file from SharePoint (moves to recycle bin — not permanent).
// Triggered by trg_documents_delete_sharepoint when documents.deleted_at transitions NULL → non-null.
// Handles 404 gracefully — file may already have been deleted directly in SharePoint.
async function handleDeleteFile(job: Job): Promise<void> {
  const spItemId = job.payload.sharepoint_item_id as string;
  const projectId = job.payload.project_id as string | undefined;
  const documentId = job.payload.document_id as string | undefined;
  if (!spItemId) throw new Error("delete_sharepoint_file: sharepoint_item_id missing");

  // Resolve the drive ID from the project row
  let driveId: string | null = null;
  if (projectId) {
    const { data: projRaw } = await supabaseAdmin
      .from("projects")
      .select("sharepoint_drive_id")
      .eq("id", projectId)
      .maybeSingle();
    driveId =
      (projRaw as { sharepoint_drive_id: string | null } | null)?.sharepoint_drive_id ?? null;
  }

  if (driveId) {
    try {
      await graphFetch({
        method: "DELETE",
        path: `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(spItemId)}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 404 / itemNotFound means the file is already gone — treat as success
      if (!msg.includes("404") && !msg.toLowerCase().includes("itemnotfound")) throw e;
    }
  }

  // Ensure deleted_at is stamped (safety net; the DB trigger should have set it already).
  // Using IS NULL guard prevents re-triggering trg_documents_delete_sharepoint.
  if (documentId) {
    await supabaseAdmin
      .from("documents" as never)
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", documentId)
      .is("deleted_at", null);
  }
}

// ---------- patch_task_metadata ----------
async function handlePatchTaskMetadata(job: Job): Promise<void> {
  const taskId = job.payload.task_id as string;
  if (!taskId) throw new Error("patch_task_metadata: task_id missing");

  const { data: taskRaw } = await supabaseAdmin
    .from("tasks")
    .select("id, status, due_date, priority, complexity, project_id, entity_id")
    .eq("id", taskId)
    .maybeSingle();
  const task = taskRaw as {
    id: string;
    status: string | null;
    due_date: string | null;
    priority: string | null;
    complexity: string | null;
    project_id: string | null;
    entity_id: string | null;
  } | null;
  if (!task || !task.entity_id) throw new Error("Task missing");

  const { data: meta } = await supabaseAdmin
    .from("task_folder_metadata" as never)
    .select("sp_list_item_id")
    .eq("task_id", taskId)
    .maybeSingle();
  const listItemId = (meta as { sp_list_item_id: string | null } | null)?.sp_list_item_id;
  if (!listItemId) throw new Error("Task folder not provisioned yet — will retry");

  // Get the site + drive from the project's Document Library (not the old firm-level config)
  const { data: projRaw } = await supabaseAdmin
    .from("projects")
    .select("sharepoint_drive_id, sharepoint_site_id")
    .eq("id", task.project_id ?? "")
    .maybeSingle();
  const proj = projRaw as {
    sharepoint_drive_id: string | null;
    sharepoint_site_id: string | null;
  } | null;
  if (!proj?.sharepoint_drive_id || !proj?.sharepoint_site_id) {
    throw new Error("Project Document Library not configured — will retry");
  }

  // Resolve the SharePoint list that backs the project's Document Library drive
  const driveInfo = await graphFetch<{ list?: { id: string } }>({
    path: `/drives/${encodeURIComponent(proj.sharepoint_drive_id)}?$select=id,list`,
  });
  const listId = driveInfo.list?.id;
  if (!listId) throw new Error("Could not resolve list backing Document Library drive");

  const fields = {
    BusActaStage: task.status ?? null,
    BusActaDueDate: task.due_date ?? null,
    BusActaPriority: task.priority ?? null,
    BusActaComplexity: task.complexity ?? null,
  };

  await graphFetch({
    method: "PATCH",
    path: `/sites/${encodeURIComponent(proj.sharepoint_site_id)}/lists/${listId}/items/${listItemId}/fields`,
    body: fields,
  });

  await supabaseAdmin
    .from("task_folder_metadata" as never)
    .update({
      sync_status: "synced",
      sync_error: null,
      synced_at: new Date().toISOString(),
    } as never)
    .eq("task_id", taskId);
}

// ── Per-project list helpers ──────────────────────────────────────────────────

type ProjectListIds = {
  tasksListId: string;
  messagesListId: string;
  auditListId: string;
  docsListId: string;
};

async function getProjectSiteId(projectId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("projects")
    .select("sharepoint_site_id")
    .eq("id", projectId)
    .maybeSingle();
  return (data as { sharepoint_site_id: string | null } | null)?.sharepoint_site_id ?? null;
}

async function getProjectListIds(projectId: string): Promise<ProjectListIds | null> {
  const { data } = await supabaseAdmin
    .from("projects")
    .select("sp_list_id_tasks, sp_list_id_messages, sp_list_id_audit, sp_list_id_documents")
    .eq("id", projectId)
    .maybeSingle();
  const p = data as {
    sp_list_id_tasks: string | null;
    sp_list_id_messages: string | null;
    sp_list_id_audit: string | null;
    sp_list_id_documents: string | null;
  } | null;
  if (
    !p?.sp_list_id_tasks ||
    !p.sp_list_id_messages ||
    !p.sp_list_id_audit ||
    !p.sp_list_id_documents
  )
    return null;
  return {
    tasksListId: p.sp_list_id_tasks,
    messagesListId: p.sp_list_id_messages,
    auditListId: p.sp_list_id_audit,
    docsListId: p.sp_list_id_documents,
  };
}

async function enqueueProvisionProjectLists(projectId: string): Promise<void> {
  await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
    {
      job_type: "provision_project_lists",
      payload: { project_id: projectId },
      status: "queued",
      attempts: 0,
      max_attempts: 5,
      next_run_at: new Date().toISOString(),
      correlation_id: `provision-lists:${projectId}`,
    } as never,
    { onConflict: "correlation_id", ignoreDuplicates: true } as never,
  );
}

// ---------- provision_project_lists ----------
async function handleProvisionProjectLists(job: Job): Promise<void> {
  const projectId = job.payload.project_id as string;
  if (!projectId) throw new Error("provision_project_lists: project_id missing");

  const { data: projRaw, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id, name, sharepoint_site_id, sp_list_id_tasks")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  const project = projRaw as {
    id: string;
    name: string | null;
    sharepoint_site_id: string | null;
    sp_list_id_tasks: string | null;
  } | null;
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Idempotent — already provisioned
  if (project.sp_list_id_tasks) return;

  if (!project.sharepoint_site_id) {
    throw new Error(
      "Project Document Library not yet provisioned — run provision_project_library first",
    );
  }

  const siteId = project.sharepoint_site_id;
  const title = project.name ?? projectId;
  const base = `BusAcTa – ${title}`;

  const [tasksListId, messagesListId, auditListId, docsListId] = await Promise.all([
    getOrCreateSharePointList(siteId, `${base} · Tasks`, TASK_COLUMNS),
    getOrCreateSharePointList(siteId, `${base} · Messages`, MESSAGE_COLUMNS),
    getOrCreateSharePointList(siteId, `${base} · Audit Log`, AUDIT_COLUMNS),
    getOrCreateSharePointList(siteId, `${base} · Documents`, DOCUMENT_COLUMNS),
  ]);

  await supabaseAdmin
    .from("projects")
    .update({
      sp_list_id_tasks: tasksListId,
      sp_list_id_messages: messagesListId,
      sp_list_id_audit: auditListId,
      sp_list_id_documents: docsListId,
    } as never)
    .eq("id", projectId);
}

// ---------- backup_task ----------
async function handleBackupTask(job: Job): Promise<void> {
  const taskId = job.payload.task_id as string;
  if (!taskId) throw new Error("backup_task: task_id missing");

  const { data: taskRaw, error: tErr } = await supabaseAdmin
    .from("tasks")
    .select(
      "id, title, slug, status, priority, complexity, due_date, project_id, entity_id, created_by, stream",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  const task = taskRaw as {
    id: string;
    title: string | null;
    slug: string | null;
    status: string | null;
    priority: string | null;
    complexity: string | null;
    due_date: string | null;
    project_id: string | null;
    entity_id: string | null;
    created_by: string | null;
    stream: string | null;
  } | null;
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (!task.project_id) throw new Error(`Task ${taskId} has no project_id — skipping backup`);

  const lists = await getProjectListIds(task.project_id);
  if (!lists) {
    await enqueueProvisionProjectLists(task.project_id);
    throw new Error("Project lists not provisioned — provision job enqueued, will retry");
  }
  const siteId = await getProjectSiteId(task.project_id);
  if (!siteId) throw new Error("Project SharePoint site not configured — will retry");

  await upsertSharePointListItem(siteId, lists.tasksListId, "TaskId", task.id, {
    Title: task.title ?? task.id,
    TaskId: task.id,
    Slug: task.slug ?? "",
    Status: task.status ?? "",
    Priority: task.priority ?? "",
    Complexity: task.complexity ?? "",
    DueDate: task.due_date ?? "",
    ProjectId: task.project_id,
    FirmId: task.entity_id ?? "",
    CreatedBy: task.created_by ?? "",
    Stream: task.stream ?? "",
  });
}

// ---------- backup_message ----------
// Only task messages are backed up per-project — firm messages have no single project_id.
async function handleBackupMessage(job: Job): Promise<void> {
  const messageId = job.payload.message_id as string;
  const messageType = (job.payload.message_type as string) ?? "task";
  if (!messageId) throw new Error("backup_message: message_id missing");

  // Firm messages cannot be attributed to a single project — skip.
  if (messageType === "firm") return;

  const { data: msgRaw, error } = await supabaseAdmin
    .from("task_messages")
    .select("id, task_id, author_id, body, is_client_visible")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const m = msgRaw as {
    id: string;
    task_id: string;
    author_id: string;
    body: string;
    is_client_visible: boolean;
  } | null;
  if (!m) throw new Error(`Task message not found: ${messageId}`);

  // Resolve project_id via the task
  const { data: taskRaw } = await supabaseAdmin
    .from("tasks")
    .select("project_id")
    .eq("id", m.task_id)
    .maybeSingle();
  const projectId = (taskRaw as { project_id: string | null } | null)?.project_id;
  if (!projectId) throw new Error(`Task ${m.task_id} has no project_id — skipping message backup`);

  const lists = await getProjectListIds(projectId);
  if (!lists) {
    await enqueueProvisionProjectLists(projectId);
    throw new Error("Project lists not provisioned — provision job enqueued, will retry");
  }
  const siteId = await getProjectSiteId(projectId);
  if (!siteId) throw new Error("Project SharePoint site not configured — will retry");

  await addSharePointListItem(siteId, lists.messagesListId, {
    Title: `task by ${m.author_id}`,
    MessageId: m.id,
    MessageType: "task",
    TaskId: m.task_id,
    FirmId: "",
    AuthorId: m.author_id,
    Body: m.body,
    IsClientVisible: m.is_client_visible,
  });
}

// ---------- backup_audit_event ----------
async function handleBackupAuditEvent(job: Job): Promise<void> {
  const auditId = job.payload.audit_id as string;
  if (!auditId) throw new Error("backup_audit_event: audit_id missing");

  const { data: eventRaw, error } = await supabaseAdmin
    .from("task_audit")
    .select("id, task_id, actor_id, event_type, payload")
    .eq("id", auditId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const ev = eventRaw as {
    id: string;
    task_id: string;
    actor_id: string | null;
    event_type: string;
    payload: unknown;
  } | null;
  if (!ev) throw new Error(`Audit event not found: ${auditId}`);

  // Resolve project_id via the task
  const { data: taskRaw } = await supabaseAdmin
    .from("tasks")
    .select("project_id")
    .eq("id", ev.task_id)
    .maybeSingle();
  const projectId = (taskRaw as { project_id: string | null } | null)?.project_id;
  if (!projectId) throw new Error(`Task ${ev.task_id} has no project_id — skipping audit backup`);

  const lists = await getProjectListIds(projectId);
  if (!lists) {
    await enqueueProvisionProjectLists(projectId);
    throw new Error("Project lists not provisioned — provision job enqueued, will retry");
  }
  const siteId = await getProjectSiteId(projectId);
  if (!siteId) throw new Error("Project SharePoint site not configured — will retry");

  await addSharePointListItem(siteId, lists.auditListId, {
    Title: `${ev.event_type} on ${ev.task_id}`,
    AuditId: ev.id,
    TaskId: ev.task_id,
    ActorId: ev.actor_id ?? "",
    EventType: ev.event_type,
    Payload: JSON.stringify(ev.payload ?? {}),
  });
}

// ---------- backup_document ----------
async function handleBackupDocument(job: Job): Promise<void> {
  const documentId = job.payload.document_id as string;
  if (!documentId) throw new Error("backup_document: document_id missing");

  const { data: docRaw, error } = await supabaseAdmin
    .from("document_nodes" as never)
    .select(
      "id, name, node_type, project_id, task_id, size_bytes, mime_type, last_modified_by, sp_item_id, sp_web_url",
    )
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error((error as { message: string }).message);
  const doc = docRaw as {
    id: string;
    name: string;
    node_type: string;
    project_id: string | null;
    task_id: string | null;
    size_bytes: number | null;
    mime_type: string | null;
    last_modified_by: string | null;
    sp_item_id: string | null;
    sp_web_url: string | null;
  } | null;
  if (!doc) throw new Error(`Document node not found: ${documentId}`);
  if (doc.node_type !== "file") return; // folders are not backed up

  // Resolve project_id — may be null if the node is task-only
  let projectId = doc.project_id;
  if (!projectId && doc.task_id) {
    const { data: taskRaw } = await supabaseAdmin
      .from("tasks")
      .select("project_id")
      .eq("id", doc.task_id)
      .maybeSingle();
    projectId = (taskRaw as { project_id: string | null } | null)?.project_id ?? null;
  }
  if (!projectId) return; // no project context — skip

  const lists = await getProjectListIds(projectId);
  if (!lists) {
    await enqueueProvisionProjectLists(projectId);
    throw new Error("Project lists not provisioned — provision job enqueued, will retry");
  }
  const siteId = await getProjectSiteId(projectId);
  if (!siteId) throw new Error("Project SharePoint site not configured — will retry");

  await addSharePointListItem(siteId, lists.docsListId, {
    Title: doc.name,
    DocumentId: doc.id,
    TaskId: doc.task_id ?? "",
    FileSizeBytes: doc.size_bytes ?? 0,
    MimeType: doc.mime_type ?? "",
    SharePointItemId: doc.sp_item_id ?? "",
    SharePointWebUrl: doc.sp_web_url ?? "",
    UploadedBy: doc.last_modified_by ?? "",
  });
}

// ---------- delta_sync_drive ----------

/** Normalises a string for fuzzy folder→task name matching.
 *  Strips leading "NN - " / "NN – " numeric prefixes common in accounting
 *  firm SharePoint naming conventions, then lowercases and collapses whitespace.
 *  Example: "01 - ALPHA ROOFING - 1120SX - 2023" → "alpha roofing - 1120sx - 2023" */
function normForFolderMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/^\d+\s*[-–]\s*/, "") // strip leading "01 - " or "64 – " prefix
    .replace(/\s+/g, " ")
    .trim();
}

export type DeltaSyncResult = {
  documents_upserted: number;
  folders_reconciled: number;
};

/**
 * Core delta-sync logic — fetches incremental changes via the Graph delta endpoint,
 * reconciles SharePoint folders with BusAcTa tasks (by ID first, by name as fallback),
 * and upserts document rows for every file found inside a matched task folder.
 *
 * Exported so it can be called directly by the trigger server function for immediate
 * on-demand syncs without going through the job queue.
 */
export async function runDeltaSyncForProject(projectId: string): Promise<DeltaSyncResult> {
  const result: DeltaSyncResult = { documents_upserted: 0, folders_reconciled: 0 };

  const { data: projRaw } = await supabaseAdmin
    .from("projects")
    .select(
      "id, firm_id, sharepoint_drive_id, sharepoint_delta_token, sharepoint_delta_link, sharepoint_initial_sync_done",
    )
    .eq("id", projectId)
    .maybeSingle();
  const project = projRaw as {
    id: string;
    firm_id: string | null;
    sharepoint_drive_id: string | null;
    sharepoint_delta_token: string | null;
    sharepoint_delta_link: string | null;
    sharepoint_initial_sync_done: boolean | null;
  } | null;

  if (!project?.sharepoint_drive_id) return result; // not configured — skip silently

  const driveId = project.sharepoint_drive_id;
  const DELTA_BASE = `/drives/${encodeURIComponent(driveId)}/root/delta`;

  // Prefer the full delta link URL (new column); fall back to reconstructing from token (old column)
  // for projects provisioned before this migration.
  // Strip GRAPH_BASE prefix if present — graphFetch always prepends it.
  const rawLink = project.sharepoint_delta_link;
  const resolvedLink = rawLink
    ? rawLink.startsWith(GRAPH_BASE)
      ? rawLink.slice(GRAPH_BASE.length)
      : rawLink
    : null;
  const initialPath: string =
    resolvedLink ??
    (project.sharepoint_delta_token
      ? `${DELTA_BASE}?$deltaToken=${encodeURIComponent(project.sharepoint_delta_token)}`
      : DELTA_BASE);

  type DeltaItem = {
    id: string;
    name: string;
    size?: number;
    file?: { mimeType?: string };
    folder?: object;
    parentReference?: { id?: string };
    "@microsoft.graph.downloadUrl"?: string;
    webUrl?: string;
    deleted?: { state: string };
  };
  type DeltaPage = {
    value: DeltaItem[];
    "@odata.nextLink"?: string;
    "@odata.deltaLink"?: string;
  };

  const items: DeltaItem[] = [];
  let currentPath: string = initialPath;
  let newDeltaLink: string | null = null;

  while (currentPath) {
    const page = await graphFetch<DeltaPage>({ path: currentPath });
    items.push(...(page.value ?? []));
    if (page["@odata.deltaLink"]) {
      newDeltaLink = page["@odata.deltaLink"]; // store full opaque URL
      currentPath = "";
    } else if (page["@odata.nextLink"]) {
      const parsed = new URL(page["@odata.nextLink"]);
      currentPath = parsed.href.startsWith(GRAPH_BASE)
        ? parsed.href.slice(GRAPH_BASE.length)
        : parsed.pathname + parsed.search;
    } else {
      currentPath = "";
    }
  }

  // ── Load ALL tasks for the project (not just those already linked) ────────
  type TaskRow = {
    id: string;
    title: string | null;
    slug: string | null;
    sharepoint_folder_id: string | null;
  };
  const { data: taskRows } = await supabaseAdmin
    .from("tasks")
    .select("id, title, slug, sharepoint_folder_id")
    .eq("project_id", projectId);
  const tasks = (taskRows ?? []) as unknown as TaskRow[];

  // Primary map: SP folder ID → task ID (tasks already linked)
  const folderIdToTaskId = new Map<string, string>();
  for (const t of tasks) {
    if (t.sharepoint_folder_id) folderIdToTaskId.set(t.sharepoint_folder_id, t.id);
  }

  // Secondary map: normalised name → unlinked task (for name-based reconciliation)
  const normNameToTask = new Map<string, TaskRow>();
  for (const t of tasks) {
    if (t.sharepoint_folder_id) continue;
    const base = t.title ?? t.slug ?? "";
    if (base) normNameToTask.set(normForFolderMatch(base), t);
  }

  // ── Soft-delete items removed from SharePoint ─────────────────────────────
  // Sets deleted_at on the documents row; the DB trigger then enqueues a
  // delete_sharepoint_file job (which is a no-op since the file is already gone).
  for (const item of items) {
    if (!item.deleted) continue;
    await supabaseAdmin
      .from("documents" as never)
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("sharepoint_item_id", item.id)
      .is("deleted_at", null); // WHERE guard prevents re-triggering the DB trigger
  }

  // ── Reconcile: match live delta folders → unlinked tasks by normalised name ─
  for (const item of items) {
    if (item.deleted || item.file || !item.name) continue; // live folders only
    if (folderIdToTaskId.has(item.id)) continue; // already linked by ID

    const matched = normNameToTask.get(normForFolderMatch(item.name));
    if (matched) {
      await supabaseAdmin
        .from("tasks")
        .update({ sharepoint_folder_id: item.id, sharepoint_folder_path: item.name } as never)
        .eq("id", matched.id)
        .is("sharepoint_folder_id", null);
      folderIdToTaskId.set(item.id, matched.id);
      normNameToTask.delete(normForFolderMatch(item.name));
      result.folders_reconciled++;
    }
  }

  // ── Upsert document rows for live files inside matched task folders ────────
  for (const item of items) {
    if (item.deleted || !item.file) continue;
    const parentFolderId = item.parentReference?.id;
    if (!parentFolderId) continue;
    const taskId = folderIdToTaskId.get(parentFolderId);
    if (!taskId) continue;

    await supabaseAdmin.from("documents" as never).upsert(
      {
        task_id: taskId,
        project_id: projectId,
        firm_id: project.firm_id,
        file_name: item.name,
        file_size_bytes: item.size ?? null,
        mime_type: item.file?.mimeType ?? null,
        sharepoint_item_id: item.id,
        sharepoint_url: item["@microsoft.graph.downloadUrl"] ?? "",
        sharepoint_web_url: item.webUrl ?? null,
        deleted_at: null, // clear soft-delete if the file was re-added after deletion
      } as never,
      { onConflict: "sharepoint_item_id" } as never,
    );
    result.documents_upserted++;
  }

  // ── Persist full delta link URL and sync timestamp ─────────────────────────
  if (newDeltaLink) {
    await supabaseAdmin
      .from("projects")
      .update({
        sharepoint_delta_link: newDeltaLink,
        sharepoint_last_synced_at: new Date().toISOString(),
        sharepoint_initial_sync_done: true,
      } as never)
      .eq("id", projectId);
  }

  return result;
}

async function handleDeltaSyncDrive(job: Job): Promise<void> {
  const projectId = job.payload.project_id as string;
  if (!projectId) throw new Error("delta_sync_drive: project_id missing");
  await runDeltaSyncForProject(projectId);
}

// ---------- dispatcher ----------
export async function dispatchJob(job: Job): Promise<void> {
  switch (job.job_type) {
    case "provision_site":
      return handleProvisionSite(job);
    case "provision_project_library":
      return handleProvisionProjectLibrary(job);
    case "provision_project_lists":
      return handleProvisionProjectLists(job);
    case "create_task_folder":
      return handleCreateTaskFolder(job);
    case "archive_task_folder":
      return handleArchiveTaskFolder(job);
    case "patch_task_metadata":
      return handlePatchTaskMetadata(job);
    case "backup_task":
      return handleBackupTask(job);
    case "backup_message":
      return handleBackupMessage(job);
    case "backup_audit_event":
      return handleBackupAuditEvent(job);
    case "backup_document":
      return handleBackupDocument(job);
    case "delta_sync_drive":
      return handleDeltaSyncDrive(job);
    case "migrate_attachment":
      return handleMigrateAttachment(job);
    case "initial_sync":
      return handleInitialSync(job);
    case "rename_task_folder":
      return handleRenameTaskFolder(job);
    case "delete_sharepoint_file":
      return handleDeleteFile(job);
    case "upload_file":
    case "delete_node":
    case "delta_sync":
    case "rename_node":
      // Phase 2+
      throw new Error(`Handler not implemented yet: ${job.job_type}`);
    default:
      throw new Error(`Unknown job_type: ${job.job_type}`);
  }
}

// ---------- migrate_attachment ----------
// Downloads a single task attachment from Supabase Storage and uploads it to the
// corresponding SharePoint task folder. Idempotent — short-circuits if the document
// row already exists in the documents table.
async function handleMigrateAttachment(job: Job): Promise<void> {
  const attachmentId = job.payload.attachment_id as string;
  if (!attachmentId) throw new Error("migrate_attachment: attachment_id missing");

  const { data: attRaw, error: attErr } = await supabaseAdmin
    .from("task_attachments" as never)
    .select(
      "id, task_id, storage_path, filename, size_bytes, mime_type, tasks!inner(sharepoint_folder_id, entity_id, projects!inner(id, firm_id, sharepoint_drive_id))",
    )
    .eq("id", attachmentId)
    .maybeSingle();
  if (attErr) throw new Error(attErr.message);

  const att = attRaw as {
    id: string;
    task_id: string;
    storage_path: string;
    filename: string;
    size_bytes: number | null;
    mime_type: string | null;
    tasks: {
      sharepoint_folder_id: string | null;
      entity_id: string | null;
      projects: { id: string; firm_id: string | null; sharepoint_drive_id: string | null };
    };
  } | null;

  if (!att) throw new Error(`Attachment not found: ${attachmentId}`);

  const folderId = att.tasks?.sharepoint_folder_id;
  const driveId = att.tasks?.projects?.sharepoint_drive_id;
  const projectId = att.tasks?.projects?.id;
  const firmId = att.tasks?.projects?.firm_id;

  // Task folder not created yet — will retry after create_task_folder job runs first
  if (!folderId || !driveId) throw new Error("Task SharePoint folder not ready yet — will retry");

  // Idempotent: skip if already migrated
  const { data: existing } = await supabaseAdmin
    .from("documents" as never)
    .select("id")
    .eq("task_id", att.task_id)
    .eq("file_name", att.filename)
    .eq("migrated_from", "supabase-storage")
    .maybeSingle();
  if (existing) return;

  // Download from Supabase Storage
  const { data: fileData, error: dlErr } = await supabaseAdmin.storage
    .from("task-attachments")
    .download(att.storage_path);
  if (dlErr || !fileData) throw new Error(dlErr?.message ?? "Download failed");

  const fileBytes = await fileData.arrayBuffer();
  const { uploadFile } = await import("./upload");
  const spFile = await uploadFile(
    driveId,
    folderId,
    att.filename,
    fileBytes,
    att.mime_type ?? "application/octet-stream",
  );

  await supabaseAdmin.from("documents" as never).insert({
    task_id: att.task_id,
    project_id: projectId,
    firm_id: firmId,
    file_name: att.filename,
    file_size_bytes: att.size_bytes,
    mime_type: att.mime_type,
    sharepoint_item_id: spFile.id,
    sharepoint_url: spFile.downloadUrl,
    sharepoint_web_url: spFile.webUrl,
    migrated_from: "supabase-storage",
    storage_path: att.storage_path,
  } as never);
}
