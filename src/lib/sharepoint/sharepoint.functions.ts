// Server functions for SharePoint configuration — firm site URL and project library URL.
// Save functions provision INLINE (call Graph API immediately) so the admin gets
// instant feedback. The job queue is still used for retries if Graph is unavailable.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchJob } from "./handlers.server";

// ─── Shared URL validator ─────────────────────────────────────────────────────
// Zod's built-in .url() is too strict for SharePoint URLs (rejects paths with
// special characters, encoded segments, etc.).  We accept any non-empty string
// that starts with https:// and let the Graph API return a 404 for bad URLs.
const spUrl = z
  .string()
  .trim()
  .max(512)
  .refine((s) => s === "" || s.toLowerCase().startsWith("https://"), {
    message: "Must be an https:// URL",
  });

// ─── Firm SharePoint Site ─────────────────────────────────────────────────────

const FirmSiteSchema = z.object({
  firm_id: z.string().uuid(),
  site_url: spUrl,
});

export const saveSharePointFirmSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FirmSiteSchema.parse(input))
  .handler(async ({ data }) => {
    const siteUrl = data.site_url.trim();

    // 1. Save URL to firms table
    const { error: firmErr } = await supabaseAdmin
      .from("firms")
      .update({ sharepoint_site_url: siteUrl || null } as never)
      .eq("id", data.firm_id);
    if (firmErr) throw new Error(firmErr.message);

    if (!siteUrl) return { ok: true, status: "cleared" };

    // 2. Ensure firm_sharepoint_config row exists
    await supabaseAdmin
      .from("firm_sharepoint_config" as never)
      .upsert(
        { firm_id: data.firm_id, provisioning_status: "pending" } as never,
        { onConflict: "firm_id", ignoreDuplicates: true } as never,
      );

    // 3. Provision inline — call the Graph API now so the admin sees the result immediately.
    //    If Graph is temporarily unavailable this throws and the UI shows the error.
    const syntheticJob = {
      id: `inline-${data.firm_id}`,
      job_type: "provision_site",
      payload: { firm_id: data.firm_id },
      firm_id: data.firm_id,
    };
    await dispatchJob(syntheticJob);

    return { ok: true, status: "active" };
  });

export const getFirmSharePointStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firm_id: string }) =>
    z.object({ firm_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("firm_sharepoint_config" as never)
      .select("sp_site_id, sp_site_url, provisioning_status, provisioning_error, provisioned_at")
      .eq("firm_id", data.firm_id)
      .maybeSingle();
    const { data: firm } = await supabaseAdmin
      .from("firms")
      .select("sharepoint_site_url")
      .eq("id", data.firm_id)
      .maybeSingle();
    return {
      site_url:
        (firm as { sharepoint_site_url?: string | null } | null)?.sharepoint_site_url ?? null,
      ...(row as {
        sp_site_id?: string | null;
        sp_site_url?: string | null;
        provisioning_status?: string | null;
        provisioning_error?: string | null;
        provisioned_at?: string | null;
      } | null),
    };
  });

// ─── Project Document Library ─────────────────────────────────────────────────

const ProjectLibrarySchema = z.object({
  project_id: z.string().uuid(),
  library_url: spUrl,
});

export const saveSharePointProjectLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProjectLibrarySchema.parse(input))
  .handler(async ({ data }) => {
    const libraryUrl = data.library_url.trim();

    // 1. Save URL to projects table; clear previously resolved IDs so they get re-resolved
    const { data: projRaw, error: pErr } = await supabaseAdmin
      .from("projects")
      .update({
        sharepoint_library_url: libraryUrl || null,
        sharepoint_drive_id: null,
        sharepoint_list_id: null,
        sharepoint_site_id: null,
      } as never)
      .eq("id", data.project_id)
      .select("firm_id")
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);

    if (!libraryUrl) return { ok: true, status: "cleared" };

    const firmId = (projRaw as { firm_id: string | null } | null)?.firm_id;
    if (!firmId) throw new Error("Project has no firm_id");

    // 2. Check if firm site is provisioned
    const { data: firmCfgRaw } = await supabaseAdmin
      .from("firm_sharepoint_config" as never)
      .select("sp_site_id")
      .eq("firm_id", firmId)
      .maybeSingle();
    const hasSite = !!(firmCfgRaw as { sp_site_id?: string | null } | null)?.sp_site_id;

    if (!hasSite) {
      // Firm site not ready — park a job; handleProvisionSite fans it out when ready
      await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
        {
          job_type: "provision_project_library",
          firm_id: firmId,
          payload: { project_id: data.project_id },
          status: "waiting_for_site",
          correlation_id: `project-lib:${data.project_id}`,
          attempts: 0,
          next_run_at: new Date().toISOString(),
        } as never,
        { onConflict: "correlation_id" } as never,
      );
      return { ok: true, status: "waiting_for_site" };
    }

    // 3. Resolve library inline — call Graph now for immediate feedback
    const syntheticJob = {
      id: `inline-${data.project_id}`,
      job_type: "provision_project_library",
      payload: { project_id: data.project_id },
      firm_id: firmId,
    };
    await dispatchJob(syntheticJob);

    return { ok: true, status: "active" };
  });

export const getProjectSharePointStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { project_id: string }) =>
    z.object({ project_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("projects")
      .select("sharepoint_library_url, sharepoint_drive_id, sharepoint_list_id, sharepoint_site_id")
      .eq("id", data.project_id)
      .maybeSingle();
    // Check if there's a pending job for this project
    const { data: job } = await supabaseAdmin
      .from("sharepoint_sync_jobs" as never)
      .select("status, last_error")
      .eq("correlation_id", `project-lib:${data.project_id}`)
      .maybeSingle();

    return {
      ...(row as {
        sharepoint_library_url?: string | null;
        sharepoint_drive_id?: string | null;
        sharepoint_list_id?: string | null;
        sharepoint_site_id?: string | null;
      } | null),
      job_status: (job as { status?: string } | null)?.status ?? null,
      job_error: (job as { last_error?: string | null } | null)?.last_error ?? null,
    };
  });

// ─── List firm documents (SharePoint files across all projects) ───────────────

export const getFirmSharePointDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firm_id: string }) =>
    z.object({ firm_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    // Return documents with their task/project context
    const { data: docs } = await supabaseAdmin
      .from("documents" as never)
      .select(
        "id, file_name, file_size_bytes, mime_type, sharepoint_url, sharepoint_web_url, uploaded_at, task_id, project_id",
      )
      .eq("firm_id", data.firm_id)
      .order("uploaded_at", { ascending: false })
      .limit(200);
    return (docs ?? []) as Array<{
      id: string;
      file_name: string;
      file_size_bytes: number | null;
      mime_type: string | null;
      sharepoint_url: string;
      sharepoint_web_url: string | null;
      uploaded_at: string;
      task_id: string | null;
      project_id: string | null;
    }>;
  });

// ─── Firm's projects with their SP library status ─────────────────────────────

export const getFirmProjectsSharePointStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firm_id: string }) =>
    z.object({ firm_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: projects } = (await (supabaseAdmin
      .from("projects" as never)
      .select("id, name, code, status, sharepoint_library_url, sharepoint_drive_id")
      .eq("firm_id", data.firm_id)
      .order("created_at", { ascending: false }) as any)) as {
      data: Array<{
        id: string;
        name: string;
        code: string | null;
        status: string;
        sharepoint_library_url: string | null;
        sharepoint_drive_id: string | null;
      }> | null;
      error: { message: string } | null;
    };
    return (projects ?? []) as Array<{
      id: string;
      name: string;
      code: string | null;
      status: string;
      sharepoint_library_url: string | null;
      sharepoint_drive_id: string | null;
    }>;
  });

// ─── Task-level SharePoint document list ─────────────────────────────────────

export type SpDocument = {
  id: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  sharepoint_url: string;
  sharepoint_web_url: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
};

export const listTaskSharePointDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { task_id: string }) =>
    z.object({ task_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: docs } = await supabaseAdmin
      .from("documents" as never)
      .select(
        "id, file_name, file_size_bytes, mime_type, sharepoint_url, sharepoint_web_url, uploaded_at, uploaded_by",
      )
      .eq("task_id", data.task_id)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false });
    return (docs ?? []) as SpDocument[];
  });

// ─── Delete a SharePoint document ────────────────────────────────────────────

export const deleteSharePointDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    // Load document + project drive
    const { data: docRaw } = await supabaseAdmin
      .from("documents" as never)
      .select("id, sharepoint_item_id, project_id")
      .eq("id", data.document_id)
      .maybeSingle();
    const doc = docRaw as {
      id: string;
      sharepoint_item_id: string;
      project_id: string | null;
    } | null;
    if (!doc) throw new Error("Document not found");

    // Soft-delete: set deleted_at rather than hard-deleting.
    // The trg_documents_delete_sharepoint trigger fires and enqueues a
    // delete_sharepoint_file job, which moves the file to the SharePoint recycle bin.
    // The row is kept for audit trail; UI queries filter WHERE deleted_at IS NULL.
    await supabaseAdmin
      .from("documents" as never)
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", data.document_id);

    return { ok: true };
  });

// ─── Per-project file statistics ─────────────────────────────────────────────

export type ProjectFileStat = {
  project_id: string;
  project_name: string;
  supabase_file_count: number;
  sharepoint_file_count: number;
  sharepoint_configured: boolean;
};

export const getProjectFileStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firm_id?: string }) =>
    z.object({ firm_id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<ProjectFileStat[]> => {
    const { data: rows, error } = await supabaseAdmin.rpc(
      "get_project_file_stats" as never,
      {
        p_firm_id: data.firm_id ?? null,
      } as never,
    );
    if (error) throw new Error((error as { message: string }).message);
    return (
      (rows ?? []) as Array<{
        project_id: string;
        project_name: string;
        supabase_file_count: number | string;
        sharepoint_file_count: number | string;
        sharepoint_drive_id: string | null;
      }>
    ).map((r) => ({
      project_id: r.project_id,
      project_name: r.project_name,
      supabase_file_count: Number(r.supabase_file_count),
      sharepoint_file_count: Number(r.sharepoint_file_count),
      sharepoint_configured: !!r.sharepoint_drive_id,
    }));
  });

// ─── On-demand delta sync trigger ────────────────────────────────────────────
// Runs delta sync INLINE (bypasses the job queue) so files saved in SharePoint
// appear in BusAcTa immediately without waiting for the next cron tick.
// Clears the stored delta token first so the full drive is re-scanned —
// this ensures any files added before the webhook subscription was created
// are also picked up.

export type TriggerSyncResult = {
  projects_synced: number;
  documents_upserted: number;
  folders_reconciled: number;
};

export const triggerDeltaSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firm_id?: string; project_id?: string }) =>
    z
      .object({
        firm_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<TriggerSyncResult> => {
    const result: TriggerSyncResult = {
      projects_synced: 0,
      documents_upserted: 0,
      folders_reconciled: 0,
    };

    // Resolve the list of projects to sync

    let q: any = supabaseAdmin
      .from("projects" as never)
      .select("id")
      .not("sharepoint_drive_id", "is", null);

    if (data.project_id) q = q.eq("id", data.project_id);
    else if (data.firm_id) q = q.eq("firm_id", data.firm_id);

    const { data: projects, error } = (await q) as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(error.message);

    const { runDeltaSyncForProject } = await import("./handlers.server");

    for (const proj of (projects ?? []) as { id: string }[]) {
      // Clear both cursor columns so a full re-scan is performed.
      // This guarantees files that pre-date the webhook subscription are caught.
      await supabaseAdmin
        .from("projects")
        .update({ sharepoint_delta_token: null, sharepoint_delta_link: null } as never)
        .eq("id", proj.id);

      const r = await runDeltaSyncForProject(proj.id);
      result.projects_synced++;
      result.documents_upserted += r.documents_upserted;
      result.folders_reconciled += r.folders_reconciled;
    }

    return result;
  });

// ─── Per-project list provisioning status ────────────────────────────────────

export type ProjectListProvisioningStatus = {
  id: string;
  name: string;
  sharepoint_drive_id: string | null;
  sharepoint_site_id: string | null;
  sp_list_id_tasks: string | null;
  sp_list_id_messages: string | null;
  sp_list_id_audit: string | null;
  sp_list_id_documents: string | null;
};

export const getProjectsListProvisioningStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firm_id?: string }) =>
    z.object({ firm_id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<ProjectListProvisioningStatus[]> => {
    // Cast to any — sp_list_id_* and sharepoint_site_id are real columns
    // (migration 20260606125057) but not yet reflected in the generated types.ts.

    let q: any = supabaseAdmin
      .from("projects" as never)
      .select(
        "id, name, sharepoint_drive_id, sharepoint_site_id, sp_list_id_tasks, sp_list_id_messages, sp_list_id_audit, sp_list_id_documents",
      )
      .not("sharepoint_site_id", "is", null)
      .order("name", { ascending: true });

    if (data.firm_id) q = q.eq("firm_id", data.firm_id);

    const { data: rows, error } = (await q) as {
      data: ProjectListProvisioningStatus[] | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const enqueueProjectListsProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        project_id: z.string().uuid().optional(),
        firm_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ queued: number }> => {
    // Use "projects" as never to bypass stale types.ts
    // Cast to any — sharepoint_site_id / sp_list_id_tasks not yet in types.ts

    let q: any = supabaseAdmin
      .from("projects" as never)
      .select("id, firm_id")
      .not("sharepoint_site_id", "is", null);

    if (data.project_id) {
      q = q.eq("id", data.project_id);
    } else if (data.firm_id) {
      q = q.eq("firm_id", data.firm_id).is("sp_list_id_tasks", null);
    } else {
      q = q.is("sp_list_id_tasks", null);
    }

    const { data: projects, error } = (await q) as {
      data: { id: string; firm_id: string | null }[] | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(error.message);

    const list = (projects ?? []) as { id: string; firm_id: string | null }[];
    if (list.length === 0) return { queued: 0 };

    await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
      list.map((proj) => ({
        job_type: "provision_project_lists",
        firm_id: proj.firm_id,
        payload: { project_id: proj.id },
        status: "queued",
        attempts: 0,
        max_attempts: 5,
        next_run_at: new Date().toISOString(),
        correlation_id: `provision-lists:${proj.id}`,
      })) as never,
      { onConflict: "correlation_id", ignoreDuplicates: true } as never,
    );

    return { queued: list.length };
  });

// ─── Migrate ALL tasks → SharePoint (queue-based) ────────────────────────────
//
// The server function enqueues jobs immediately and returns.
// The cron worker (sharepoint-worker) processes them batch-by-batch in the
// background — this avoids Cloudflare Worker CPU timeouts on large datasets.
//
// Phase A — create_task_folder job per task that has no SP folder yet
// Phase B — migrate_attachment job per task_attachment not yet in documents table
//
// Both job types are idempotent: the handlers short-circuit if work is already done.

export type MigrationResult = {
  /** Tasks queried for folder provisioning */
  total_tasks: number;
  /** Dry run only: tasks that would get a folder */
  folders_created: number;
  /** Dry run only: attachments that would be uploaded */
  files_migrated: number;
  /** Tasks skipped because their project has no SP library configured */
  skipped: number;
  errors: Array<{ name: string; reason: string }>;
  dry_run: boolean;
  /** Real run: create_task_folder jobs queued */
  folders_queued?: number;
  /** Real run: migrate_attachment jobs queued */
  files_queued?: number;
};

type TaskMigRow = {
  id: string;
  title: string | null;
  slug: string | null;
  entity_id: string | null;
  sharepoint_folder_id: string | null;
  projects: {
    id: string;
    firm_id: string | null;
    sharepoint_drive_id: string | null;
  };
};

// createTaskFolderInline is kept for potential future direct use (e.g. single-task provisioning).
async function createTaskFolderInline(
  taskId: string,
  taskTitle: string | null,
  taskSlug: string | null,
  entityId: string | null,
  driveId: string,
): Promise<string> {
  const rawSlug =
    taskSlug ??
    taskTitle
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) ??
    taskId;
  const folderName =
    (taskTitle ?? rawSlug)
      .replace(/["*:<>?/\\|]+/g, "-")
      .trim()
      .slice(0, 240) || "untitled";

  const { graphFetch } = await import("./graph-client.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let folderItem: { id: string; sharepointIds?: { listItemId?: string } } | null = null;
  try {
    folderItem = await graphFetch<{ id: string; sharepointIds?: { listItemId?: string } }>({
      method: "POST",
      path: `/drives/${encodeURIComponent(driveId)}/items/root/children`,
      body: { name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "fail" },
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("409")) {
      const res = await graphFetch<{ value: Array<{ id: string }> }>({
        path: `/drives/${encodeURIComponent(driveId)}/root/children?$filter=${encodeURIComponent(`name eq '${folderName.replace(/'/g, "''")}'`)}&$select=id`,
      });
      const existingId = res.value?.[0]?.id ?? null;
      if (existingId) folderItem = { id: existingId };
    } else throw e;
  }
  if (!folderItem?.id) throw new Error("Could not create task folder");

  await supabaseAdmin
    .from("tasks" as never)
    .update({ sharepoint_folder_id: folderItem.id, sharepoint_folder_path: folderName } as never)
    .eq("id", taskId);

  // Best-effort: set ClientName metadata on the folder list item
  if (entityId && folderItem.sharepointIds?.listItemId) {
    const { data: entityRaw } = await supabaseAdmin
      .from("client_entities" as never)
      .select("name")
      .eq("id", entityId)
      .maybeSingle();
    const clientName = (entityRaw as { name?: string } | null)?.name ?? "";
    if (clientName) {
      try {
        await graphFetch({
          method: "PATCH",
          path: `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderItem.id)}/listItem/fields`,
          body: { ClientName: clientName },
        });
      } catch {
        // Column may not exist yet on this library — non-fatal
      }
    }
  }

  return folderItem.id;
}

export const migrateTaskAttachmentsToSharePoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        firm_id: z.string().uuid().optional(),
        dry_run: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MigrationResult> => {
    const result: MigrationResult = {
      total_tasks: 0,
      folders_created: 0,
      files_migrated: 0,
      skipped: 0,
      errors: [],
      dry_run: data.dry_run,
      folders_queued: 0,
      files_queued: 0,
    };

    // ── Phase A: Query tasks without a SharePoint folder ───────────────────────

    let tasksQuery: any = supabaseAdmin
      .from("tasks" as never)
      .select(
        "id, title, slug, entity_id, sharepoint_folder_id, projects!inner(id, firm_id, sharepoint_drive_id)",
      )
      .is("sharepoint_folder_id", null)
      .not("project_id", "is", null);

    if (data.firm_id) tasksQuery = tasksQuery.eq("projects.firm_id", data.firm_id);

    const { data: taskRows, error: tasksErr } = (await tasksQuery) as {
      data: TaskMigRow[] | null;
      error: { message: string } | null;
    };
    if (tasksErr) throw new Error(`Task query failed: ${tasksErr.message}`);

    const taskList = (taskRows ?? []) as TaskMigRow[];
    result.total_tasks = taskList.length;

    // Separate tasks into: skipped (no SP library) vs. to-process
    const toProcess = taskList.filter((t) => {
      if (!t.projects?.sharepoint_drive_id) {
        result.skipped++;
        return false;
      }
      return true;
    });

    if (data.dry_run) {
      // Dry run: count only, no DB writes
      result.folders_created = toProcess.length;

      // Count attachments that would be uploaded

      let attCountQuery: any = supabaseAdmin
        .from("task_attachments" as never)
        .select("id", { count: "exact", head: true })
        .not("tasks.projects.sharepoint_drive_id", "is", null);
      if (data.firm_id) attCountQuery = attCountQuery.eq("tasks.projects.firm_id", data.firm_id);
      const { count } = (await attCountQuery) as { count: number | null };
      result.files_migrated = count ?? 0;
      return result;
    }

    // ── Phase A (real run): bulk-enqueue create_task_folder jobs ──────────────
    const folderJobs = toProcess.map((task) => ({
      job_type: "create_task_folder",
      firm_id: task.projects?.firm_id ?? null,
      payload: { task_id: task.id },
      status: "queued",
      attempts: 0,
      max_attempts: 5,
      next_run_at: new Date().toISOString(),
      correlation_id: `task-folder:${task.id}`,
    }));

    if (folderJobs.length > 0) {
      await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
        folderJobs as never,
        {
          onConflict: "correlation_id",
          ignoreDuplicates: true,
        } as never,
      );
    }
    result.folders_queued = folderJobs.length;

    // ── Phase B (real run): bulk-enqueue migrate_attachment jobs ──────────────
    // Query all task_attachments in SP-configured projects. The handler is
    // idempotent and skips attachments already present in the documents table.

    let attQuery: any = supabaseAdmin
      .from("task_attachments" as never)
      .select("id, tasks!inner(projects!inner(firm_id, sharepoint_drive_id))")
      .not("tasks.projects.sharepoint_drive_id", "is", null);

    if (data.firm_id) attQuery = attQuery.eq("tasks.projects.firm_id", data.firm_id);

    const { data: attachments } = (await attQuery) as {
      data: { id: string }[] | null;
      error: { message: string } | null;
    };

    const attachmentJobs = ((attachments ?? []) as { id: string }[]).map((att) => ({
      job_type: "migrate_attachment",
      firm_id: null as string | null,
      payload: { attachment_id: att.id },
      status: "queued",
      attempts: 0,
      max_attempts: 3,
      next_run_at: new Date().toISOString(),
      correlation_id: `migrate-att:${att.id}`,
    }));

    if (attachmentJobs.length > 0) {
      await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
        attachmentJobs as never,
        {
          onConflict: "correlation_id",
          ignoreDuplicates: true,
        } as never,
      );
    }
    result.files_queued = attachmentJobs.length;

    return result;
  });

// ─── Sync Status ──────────────────────────────────────────────────────────────

export type SyncStatusRow = {
  project_id: string;
  project_name: string;
  library_configured: boolean;
  initial_sync_done: boolean;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  last_synced_at: string | null;
  file_count: number;
};

export const getSharePointSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firm_id?: string }) =>
    z.object({ firm_id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    // 1. Fetch projects with their SP fields and subscription info.
    //    If firm_id is provided, scope to that firm; otherwise return all projects.

    let projectQuery: any = supabaseAdmin
      .from("projects" as never)
      .select(
        "id, name, sharepoint_drive_id, sharepoint_initial_sync_done, sharepoint_delta_link, last_synced_at",
      )
      .order("name");
    if (data.firm_id) projectQuery = projectQuery.eq("firm_id", data.firm_id);
    const { data: projects, error } = (await projectQuery) as {
      data:
        | {
            id: string;
            name: string;
            sharepoint_drive_id: string | null;
            sharepoint_initial_sync_done: boolean | null;
            sharepoint_delta_link: string | null;
            last_synced_at: string | null;
          }[]
        | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);

    const rows: SyncStatusRow[] = [];

    for (const proj of (projects ?? []) as {
      id: string;
      name: string;
      sharepoint_drive_id: string | null;
      sharepoint_initial_sync_done: boolean | null;
      sharepoint_delta_link: string | null;
      last_synced_at: string | null;
    }[]) {
      // Subscription status for this project
      const { data: sub } = await supabaseAdmin
        .from("sharepoint_subscriptions" as never)
        .select("status, expires_at")
        .eq("project_id", proj.id)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Count non-deleted documents
      const { count: fileCount } = await supabaseAdmin
        .from("documents" as never)
        .select("id", { count: "exact", head: true })
        .eq("project_id", proj.id)
        .is("deleted_at", null);

      rows.push({
        project_id: proj.id,
        project_name: proj.name,
        library_configured: !!proj.sharepoint_drive_id,
        initial_sync_done: proj.sharepoint_initial_sync_done ?? false,
        subscription_status: (sub as { status: string } | null)?.status ?? null,
        subscription_expires_at: (sub as { expires_at: string } | null)?.expires_at ?? null,
        last_synced_at: proj.last_synced_at,
        file_count: fileCount ?? 0,
      });
    }

    return rows;
  });

// ─── Trigger Initial Sync ─────────────────────────────────────────────────────

export const triggerInitialSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { project_id: string }) =>
    z.object({ project_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: proj, error } = await supabaseAdmin
      .from("projects" as never)
      .select("id, firm_id, sharepoint_drive_id")
      .eq("id", data.project_id)
      .single();

    if (error || !proj) throw new Error("Project not found");

    const p = proj as { id: string; firm_id: string; sharepoint_drive_id: string | null };
    if (!p.sharepoint_drive_id) {
      throw new Error("SharePoint library not configured for this project");
    }

    await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
      {
        job_type: "initial_sync",
        firm_id: p.firm_id,
        payload: { project_id: p.id },
        status: "queued",
        attempts: 0,
        max_attempts: 3,
        next_run_at: new Date().toISOString(),
        correlation_id: `initial-sync:${p.id}`,
      } as never,
      { onConflict: "correlation_id" } as never,
    );

    return { ok: true };
  });

// ─── Reset Project Sync ───────────────────────────────────────────────────────
// Hard-deletes document metadata and resets sync cursors, then enqueues a fresh
// initial_sync. Uses hard DELETE (not soft-delete) so the DB trigger does NOT
// fire and no SP files are touched — only the local mirror is cleared.

export const resetProjectSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { project_id: string }) =>
    z.object({ project_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: proj, error } = await supabaseAdmin
      .from("projects" as never)
      .select("id, firm_id, sharepoint_drive_id")
      .eq("id", data.project_id)
      .single();

    if (error || !proj) throw new Error("Project not found");

    const p = proj as { id: string; firm_id: string; sharepoint_drive_id: string | null };

    // 1. Hard-delete all document rows — this is a DELETE, not UPDATE, so
    //    trg_documents_delete_sharepoint does NOT fire and no SP files are removed.
    await supabaseAdmin
      .from("documents" as never)
      .delete()
      .eq("project_id", p.id);

    // 2. Clear sync cursors and initial-sync flag so delta sync starts fresh.
    await supabaseAdmin
      .from("projects" as never)
      .update({
        sharepoint_delta_token: null,
        sharepoint_delta_link: null,
        sharepoint_initial_sync_done: false,
      } as never)
      .eq("id", p.id);

    // 3. Enqueue a fresh initial_sync job.
    if (p.sharepoint_drive_id) {
      await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
        {
          job_type: "initial_sync",
          firm_id: p.firm_id,
          payload: { project_id: p.id },
          status: "queued",
          attempts: 0,
          max_attempts: 3,
          next_run_at: new Date().toISOString(),
          correlation_id: `initial-sync:${p.id}`,
        } as never,
        { onConflict: "correlation_id" } as never,
      );
    }

    return { ok: true };
  });
