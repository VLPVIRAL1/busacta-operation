// Server functions for the Task Document Manager.
// Persists folder structure (task_document_folders) and file metadata
// (task_attachments) keyed by taskId; storage lives in the existing
// private `task-attachments` bucket.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildProfileLabelMap } from "@/lib/shared/profile-name";

const PathSchema = z
  .string()
  .max(1024)
  .regex(/^([^\/\n\r]+(\/[^\/\n\r]+)*)?$/, "Invalid folder path")
  .transform((s) => s.replace(/^\/+|\/+$/g, ""));

const NameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^\/\\\n\r]+$/, "Name cannot contain slashes");

const TaskIdSchema = z.string().uuid();
const FileIdSchema = z.string().uuid();

export type TaskFileRow = {
  id: string;
  task_id: string;
  folder_path: string;
  filename: string;
  size_bytes: number | null;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
  is_client_visible: boolean;
  client_visible_override: boolean | null;
  uploader_id: string | null;
  category_id: string | null;
  category_ids: string[];
  description: string | null;
  is_shared?: boolean;
};

export type TaskFolderRow = {
  id: string;
  path: string;
  is_client_visible: boolean;
  color: string | null;
};

export type ProjectFileCategory = {
  id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
};

export const listTaskDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: TaskIdSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const [filesRes, foldersRes] = await Promise.all([
      supabase
        .from("task_attachments")
        .select(
          "id, task_id, folder_path, filename, size_bytes, mime_type, storage_path, created_at, is_client_visible, client_visible_override, uploader_id, category_id, description, is_shared, categorisation_status, doc_type, mapped_category, confidence_score, detection_method",
        )
        .eq("task_id", data.taskId)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("task_document_folders")
        .select("id, path, is_client_visible, color")
        .eq("task_id", data.taskId),
    ]);
    if (filesRes.error) throw new Error(filesRes.error.message);
    if (foldersRes.error) throw new Error(foldersRes.error.message);
    const files = (filesRes.data ?? []) as TaskFileRow[];
    const fileIds = files.map((f) => f.id);
    const catMap = new Map<string, string[]>();
    if (fileIds.length) {
      const { data: assigns, error: assignsErr } = await supabase
        .from("task_attachment_categories")
        .select("attachment_id, category_id")
        .in("attachment_id", fileIds);
      if (assignsErr) throw new Error(assignsErr.message);
      for (const a of (assigns ?? []) as Array<{ attachment_id: string; category_id: string }>) {
        const arr = catMap.get(a.attachment_id) ?? [];
        arr.push(a.category_id);
        catMap.set(a.attachment_id, arr);
      }
    }
    return {
      files: files.map((f) => ({
        ...f,
        category_ids: catMap.get(f.id) ?? (f.category_id ? [f.category_id] : []),
      })) as TaskFileRow[],
      folders: (foldersRes.data ?? []) as TaskFolderRow[],
    };
  });

export const createTaskFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ taskId: TaskIdSchema, parent: PathSchema.optional().default(""), name: NameSchema })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const path = data.parent ? `${data.parent}/${data.name}` : data.name;
    const { error } = await supabase
      .from("task_document_folders")
      .insert({ task_id: data.taskId, path, created_by: userId });
    if (error && !`${error.message}`.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    return { path };
  });

export const recordUploadedFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        taskId: TaskIdSchema,
        folderPath: PathSchema.optional().default(""),
        storagePath: z.string().min(1).max(1024),
        filename: NameSchema,
        sizeBytes: z
          .number()
          .int()
          .min(0)
          .max(2 * 1024 * 1024 * 1024),
        mimeType: z.string().max(255).nullable().optional(),
        isClientVisible: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    // Insert without resolved visibility; BEFORE-INSERT trigger resolves
    // `is_client_visible` from the explicit override + folder visibility.
    const insertPayload: Record<string, unknown> = {
      task_id: data.taskId,
      folder_path: data.folderPath,
      storage_path: data.storagePath,
      filename: data.filename,
      size_bytes: data.sizeBytes,
      mime_type: data.mimeType ?? null,
      uploader_id: userId,
    };
    if (typeof data.isClientVisible === "boolean") {
      insertPayload.client_visible_override = data.isClientVisible;
    }
    // Mark PDFs and images for auto-categorisation
    const catMimeTypes = ["application/pdf", "image/png", "image/jpeg", "image/tiff"];
    if (data.mimeType && catMimeTypes.includes(data.mimeType)) {
      insertPayload.categorisation_status = "pending";
    }
    const { data: row, error } = await supabase
      .from("task_attachments")
      .insert(insertPayload)
      .select(
        "id, task_id, folder_path, filename, size_bytes, mime_type, storage_path, created_at, is_client_visible, client_visible_override, uploader_id, categorisation_status",
      )
      .single();
    if (error) throw new Error(error.message);
    return row as TaskFileRow;
  });

export const renameTaskFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fileId: FileIdSchema, name: NameSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("task_attachments")
      .update({ filename: data.name })
      .eq("id", data.fileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameTaskFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ taskId: TaskIdSchema, oldPath: PathSchema, newPath: PathSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    if (!data.oldPath || !data.newPath) throw new Error("Path required");
    if (data.oldPath === data.newPath) return { ok: true };

    const oldPrefix = `${data.oldPath}/`;

    // Update folders: exact match + all descendants
    const { data: folderRows, error: fErr } = await supabase
      .from("task_document_folders")
      .select("id, path")
      .eq("task_id", data.taskId);
    if (fErr) throw new Error(fErr.message);
    for (const f of (folderRows ?? []) as Array<{ id: string; path: string }>) {
      let newP: string | null = null;
      if (f.path === data.oldPath) newP = data.newPath;
      else if (f.path.startsWith(oldPrefix))
        newP = data.newPath + "/" + f.path.slice(oldPrefix.length);
      if (newP) {
        const { error } = await supabase
          .from("task_document_folders")
          .update({ path: newP })
          .eq("id", f.id);
        if (error) throw new Error(error.message);
      }
    }

    // Update files
    const { data: fileRows, error: aErr } = await supabase
      .from("task_attachments")
      .select("id, folder_path")
      .eq("task_id", data.taskId)
      .is("archived_at", null);
    if (aErr) throw new Error(aErr.message);
    for (const a of (fileRows ?? []) as Array<{ id: string; folder_path: string }>) {
      let newP: string | null = null;
      if (a.folder_path === data.oldPath) newP = data.newPath;
      else if (a.folder_path.startsWith(oldPrefix))
        newP = data.newPath + "/" + a.folder_path.slice(oldPrefix.length);
      if (newP !== null) {
        const { error } = await supabase
          .from("task_attachments")
          .update({ folder_path: newP })
          .eq("id", a.id);
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const moveTaskFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ fileIds: z.array(FileIdSchema).min(1).max(500), toFolder: PathSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("task_attachments")
      .update({ folder_path: data.toFolder })
      .in("id", data.fileIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const moveTaskFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ taskId: TaskIdSchema, fromPath: PathSchema, toParent: PathSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!data.fromPath) throw new Error("Cannot move root");
    const segments = data.fromPath.split("/");
    const leaf = segments[segments.length - 1];
    const newPath = data.toParent ? `${data.toParent}/${leaf}` : leaf;
    if (newPath === data.fromPath) return { ok: true };
    if (newPath.startsWith(`${data.fromPath}/`)) {
      throw new Error("Cannot move a folder into itself");
    }
    // Delegate to rename
    const fn = (await import("./task-documents.functions")).renameTaskFolder;
    return fn({ data: { taskId: data.taskId, oldPath: data.fromPath, newPath } });
  });

export const setTaskFileVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        fileIds: z.array(FileIdSchema).min(1).max(500),
        // boolean = explicit override; null = clear override (inherit folder default)
        visible: z.union([z.boolean(), z.null()]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("task_attachments")
      .update({ client_visible_override: data.visible })
      .in("id", data.fileIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTaskFolderVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ taskId: TaskIdSchema, path: PathSchema, visible: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("task_document_folders")
      .update({ is_client_visible: data.visible })
      .eq("task_id", data.taskId)
      .eq("path", data.path);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTaskFolderColor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        taskId: TaskIdSchema,
        path: PathSchema,
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("task_document_folders")
      .update({ color: data.color })
      .eq("task_id", data.taskId)
      .eq("path", data.path);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type DocumentAuditEvent = {
  id: string;
  task_id: string;
  node_kind: "file" | "folder";
  node_id: string;
  node_label: string | null;
  event_type: string;
  actor_id: string | null;
  actor_name: string | null;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  occurred_at: string;
};

export const listDocumentAuditEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        taskId: TaskIdSchema,
        nodeIds: z.array(z.string().uuid()).max(500).optional(),
        limit: z.number().int().min(1).max(500).optional().default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    let q = supabase
      .from("task_document_events")
      .select(
        "id, task_id, node_kind, node_id, node_label, event_type, actor_id, before, after, occurred_at",
      )
      .eq("task_id", data.taskId)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.nodeIds?.length) q = q.in("node_id", data.nodeIds);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const actorIds = [
      ...new Set(
        ((rows ?? []) as Array<{ actor_id: string | null }>)
          .map((r) => r.actor_id)
          .filter((v): v is string => !!v),
      ),
    ];
    let nameMap = new Map<string, string>();
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      nameMap = buildProfileLabelMap(
        (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>,
      );
    }
    return ((rows ?? []) as Array<Omit<DocumentAuditEvent, "actor_name">>).map((r) => ({
      ...r,
      actor_name: r.actor_id ? (nameMap.get(r.actor_id) ?? "Unknown") : "System",
    })) as DocumentAuditEvent[];
  });

export const deleteTaskFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fileIds: z.array(FileIdSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    // Fetch storage paths to clean up
    const { data: rows } = await supabase
      .from("task_attachments")
      .select("storage_path")
      .in("id", data.fileIds);
    const paths = ((rows ?? []) as Array<{ storage_path: string }>)
      .map((r) => r.storage_path)
      .filter(Boolean);
    if (paths.length) {
      await supabase.storage.from("task-attachments").remove(paths);
    }
    const { error } = await supabase
      .from("task_attachments")
      .update({ archived_at: new Date().toISOString() })
      .in("id", data.fileIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTaskFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: TaskIdSchema, path: PathSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    if (!data.path) throw new Error("Cannot delete root");
    const prefix = `${data.path}/`;

    // Collect descendant files
    const { data: files } = await supabase
      .from("task_attachments")
      .select("id, storage_path, folder_path")
      .eq("task_id", data.taskId)
      .is("archived_at", null);
    const toDelete = (
      (files ?? []) as Array<{ id: string; storage_path: string; folder_path: string }>
    ).filter((f) => f.folder_path === data.path || f.folder_path.startsWith(prefix));
    if (toDelete.length) {
      const paths = toDelete.map((f) => f.storage_path).filter(Boolean);
      if (paths.length) await supabase.storage.from("task-attachments").remove(paths);
      await supabase
        .from("task_attachments")
        .update({ archived_at: new Date().toISOString() })
        .in(
          "id",
          toDelete.map((f) => f.id),
        );
    }

    // Remove folder rows
    const { data: folderRows } = await supabase
      .from("task_document_folders")
      .select("id, path")
      .eq("task_id", data.taskId);
    const ids = ((folderRows ?? []) as Array<{ id: string; path: string }>)
      .filter((f) => f.path === data.path || f.path.startsWith(prefix))
      .map((f) => f.id);
    if (ids.length) {
      await supabase.from("task_document_folders").delete().in("id", ids);
    }
    return { ok: true };
  });

export const getTaskFileSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ fileId: FileIdSchema, download: z.boolean().optional().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: row, error: rowErr } = await supabase
      .from("task_attachments")
      .select("storage_path, filename, mime_type")
      .eq("id", data.fileId)
      .single();
    if (rowErr || !row) throw new Error(rowErr?.message ?? "File not found");

    const options: Record<string, unknown> = {};
    if (data.download) options.download = row.filename;

    const { data: signed, error } = await supabase.storage
      .from("task-attachments")
      .createSignedUrl(row.storage_path, 120, options);
    if (error || !signed) throw new Error(error?.message ?? "Failed to sign URL");
    return { url: signed.signedUrl, filename: row.filename, mimeType: row.mime_type };
  });

// Toggle the "shared" flag on a task file. This is the ONLY entry point for
// the shared flag -- it is invoked exclusively from the Task Files tab, which
// satisfies the rule that documents only ever originate from a Task. A shared
// file surfaces (as a virtual reference) in the nearest Residual / Shared
// Resources folder of its project/client in the File Gallery.
export const setTaskFileShared = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fileId: FileIdSchema, isShared: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { error } = await supabase
      .from("task_attachments")
      .update({
        is_shared: data.isShared,
        shared_at: data.isShared ? new Date().toISOString() : null,
        shared_by: data.isShared ? userId : null,
      })
      .eq("id", data.fileId);
    if (error) throw new Error(error.message);
    return { ok: true, isShared: data.isShared };
  });

export const renameTaskFilesBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        renames: z
          .array(z.object({ fileId: FileIdSchema, name: NameSchema }))
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    for (const r of data.renames) {
      const { error } = await supabase
        .from("task_attachments")
        .update({ filename: r.name })
        .eq("id", r.fileId);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.renames.length };
  });

// ---------------------------------------------------------------------------
// Project-scoped file categories
// ---------------------------------------------------------------------------

const ProjectIdSchema = z.string().uuid();
const CategoryIdSchema = z.string().uuid();
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be hex like #RRGGBB");

async function resolveProjectIdFromTask(supabase: any, taskId: string): Promise<string | null> {
  const { data } = await supabase
    .from("tasks")
    .select("client_entities(project_id)")
    .eq("id", taskId)
    .single();
  return data?.client_entities?.project_id ?? null;
}

/** Best-effort insert into public.task_audit. Never throws — auditing must
 *  not block the primary write. */
async function writeTaskAudit(
  supabase: any,
  taskId: string | null | undefined,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!taskId) return;
  try {
    await supabase.from("task_audit").insert({
      task_id: taskId,
      event_type: eventType,
      payload,
    });
  } catch {
    // swallow — audit is observational
  }
}

/** Look up an existing category for a project by case-insensitive name. */
async function findCategoryByName(
  supabase: any,
  projectId: string,
  name: string,
): Promise<ProjectFileCategory | null> {
  const { data } = await supabase
    .from("project_file_categories")
    .select("id, project_id, name, color, sort_order, is_active")
    .eq("project_id", projectId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  return (data as ProjectFileCategory | null) ?? null;
}

export const listProjectFileCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: ProjectIdSchema.optional(),
        taskId: TaskIdSchema.optional(),
        includeInactive: z.boolean().optional().default(false),
      })
      .refine((v) => v.projectId || v.taskId, "projectId or taskId required")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    let projectId = data.projectId;
    if (!projectId && data.taskId) {
      projectId = (await resolveProjectIdFromTask(supabase, data.taskId)) ?? undefined;
    }
    if (!projectId) return [] as ProjectFileCategory[];
    let q = supabase
      .from("project_file_categories")
      .select("id, project_id, name, color, sort_order, is_active")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (!data.includeInactive) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProjectFileCategory[];
  });

export const createProjectFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: ProjectIdSchema.optional(),
        taskId: TaskIdSchema.optional(),
        name: NameSchema,
        color: HexColorSchema.optional().default("#6366f1"),
        sortOrder: z.number().int().min(0).max(9999).optional().default(0),
      })
      .refine((v) => v.projectId || v.taskId, "projectId or taskId required")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    let projectId = data.projectId;
    if (!projectId && data.taskId) {
      projectId = (await resolveProjectIdFromTask(supabase, data.taskId)) ?? undefined;
    }
    if (!projectId) {
      throw new Error("Could not resolve project for this task");
    }
    // Case-insensitive pre-check (DB still backstops via UNIQUE(project_id, lower(name))).
    const existing = await findCategoryByName(supabase, projectId, data.name);
    if (existing) {
      throw new Error(`A category named "${existing.name}" already exists in this project`);
    }
    const { data: row, error } = await supabase
      .from("project_file_categories")
      .insert({
        project_id: projectId,
        name: data.name,
        color: data.color,
        sort_order: data.sortOrder,
        created_by: userId,
      })
      .select("id, project_id, name, color, sort_order, is_active")
      .single();
    if (error) {
      if (`${error.message}`.toLowerCase().includes("duplicate")) {
        throw new Error(`A category named "${data.name}" already exists in this project`);
      }
      throw new Error(error.message);
    }
    const created = row as ProjectFileCategory;
    await writeTaskAudit(supabase, data.taskId, "category_created", {
      category_id: created.id,
      name: created.name,
      color: created.color,
    });
    return created;
  });

export const updateProjectFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        categoryId: CategoryIdSchema,
        name: NameSchema.optional(),
        color: HexColorSchema.optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.color !== undefined) patch.color = data.color;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    const { error } = await supabase
      .from("project_file_categories")
      .update(patch)
      .eq("id", data.categoryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Inline rename from the picker. Case-insensitive dup check, then update;
 *  task_attachment_categories rows reference category_id so the rename
 *  propagates to every file automatically. */
export const renameProjectFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        categoryId: CategoryIdSchema,
        name: NameSchema,
        taskId: TaskIdSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: current, error: getErr } = await supabase
      .from("project_file_categories")
      .select("id, project_id, name")
      .eq("id", data.categoryId)
      .single();
    if (getErr) throw new Error(getErr.message);
    if (!current) throw new Error("Category not found");
    if (current.name === data.name) return { ok: true, unchanged: true };
    // Case-insensitive dup check among siblings.
    const dup = await findCategoryByName(supabase, current.project_id, data.name);
    if (dup && dup.id !== data.categoryId) {
      throw new Error(`A category named "${dup.name}" already exists in this project`);
    }
    const { error: updErr } = await supabase
      .from("project_file_categories")
      .update({ name: data.name })
      .eq("id", data.categoryId);
    if (updErr) {
      if (`${updErr.message}`.toLowerCase().includes("duplicate")) {
        throw new Error(`A category named "${data.name}" already exists in this project`);
      }
      throw new Error(updErr.message);
    }
    await writeTaskAudit(supabase, data.taskId, "category_renamed", {
      category_id: data.categoryId,
      from: current.name,
      to: data.name,
    });
    return { ok: true };
  });

/** Delete a project category, safely cleaning up file assignments first.
 *  Modes:
 *   - "untag" (default): remove this category from every file in the project
 *     (both task_attachment_categories rows and the legacy single
 *     task_attachments.category_id column).
 *   - "reassign": move every assignment to `reassignToCategoryId` (must belong
 *     to the same project). Duplicate (attachment, target) rows are de-duped.
 *  The category row itself is deleted at the end so the picker no longer
 *  shows it. Audit logged as `category_deleted`.
 */
export const deleteProjectFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        categoryId: CategoryIdSchema,
        mode: z.enum(["untag", "reassign"]).optional().default("untag"),
        reassignToCategoryId: CategoryIdSchema.nullable().optional(),
        taskId: TaskIdSchema.optional(),
      })
      .refine(
        (v) => v.mode !== "reassign" || !!v.reassignToCategoryId,
        "reassignToCategoryId is required when mode is reassign",
      )
      .refine(
        (v) => v.reassignToCategoryId !== v.categoryId,
        "Cannot reassign a category to itself",
      )
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };

    const { data: current, error: getErr } = await supabase
      .from("project_file_categories")
      .select("id, project_id, name")
      .eq("id", data.categoryId)
      .single();
    if (getErr) throw new Error(getErr.message);
    if (!current) throw new Error("Category not found");

    // If reassigning, verify target belongs to the same project.
    if (data.mode === "reassign" && data.reassignToCategoryId) {
      const { data: target } = await supabase
        .from("project_file_categories")
        .select("id, project_id, name")
        .eq("id", data.reassignToCategoryId)
        .maybeSingle();
      if (!target) throw new Error("Reassignment target category not found");
      if (target.project_id !== current.project_id) {
        throw new Error("Reassignment target must belong to the same project");
      }
    }

    // 1. Find every join row referencing this category, plus the legacy
    //    column references. We need attachment_ids for the reassign path.
    const { data: joinRows, error: joinErr } = await supabase
      .from("task_attachment_categories")
      .select("attachment_id")
      .eq("category_id", data.categoryId);
    if (joinErr) throw new Error(joinErr.message);
    const affectedAttachmentIds = Array.from(
      new Set((joinRows ?? []).map((r: { attachment_id: string }) => r.attachment_id)),
    );

    if (data.mode === "reassign" && data.reassignToCategoryId) {
      // Insert new join rows for the target, ignore duplicates, then drop the
      // originals. Order matters: insert first so we never leave a file with
      // no category mid-transition.
      if (affectedAttachmentIds.length > 0) {
        const upsertRows = affectedAttachmentIds.map((aid) => ({
          attachment_id: aid,
          category_id: data.reassignToCategoryId,
        }));
        const { error: upErr } = await supabase
          .from("task_attachment_categories")
          .upsert(upsertRows, { onConflict: "attachment_id,category_id", ignoreDuplicates: true });
        if (upErr) throw new Error(upErr.message);
      }
      // Move legacy single-category pointer.
      const { error: legacyErr } = await supabase
        .from("task_attachments")
        .update({ category_id: data.reassignToCategoryId })
        .eq("category_id", data.categoryId);
      if (legacyErr) throw new Error(legacyErr.message);
    } else {
      // Untag: clear legacy column for any file that pointed here.
      const { error: legacyErr } = await supabase
        .from("task_attachments")
        .update({ category_id: null })
        .eq("category_id", data.categoryId);
      if (legacyErr) throw new Error(legacyErr.message);
    }

    // 2. Always remove the join rows for this category (either replaced by
    //    target above, or simply being untagged).
    const { error: delJoinErr } = await supabase
      .from("task_attachment_categories")
      .delete()
      .eq("category_id", data.categoryId);
    if (delJoinErr) throw new Error(delJoinErr.message);

    // 3. Finally drop the category row itself.
    const { error: delCatErr } = await supabase
      .from("project_file_categories")
      .delete()
      .eq("id", data.categoryId);
    if (delCatErr) throw new Error(delCatErr.message);

    await writeTaskAudit(supabase, data.taskId, "category_deleted", {
      category_id: data.categoryId,
      name: current.name,
      mode: data.mode,
      reassigned_to: data.mode === "reassign" ? data.reassignToCategoryId : null,
      affected_files: affectedAttachmentIds.length,
    });

    return {
      ok: true,
      affectedFiles: affectedAttachmentIds.length,
      mode: data.mode,
    };
  });

export const setTaskFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        fileIds: z.array(FileIdSchema).min(1).max(500),
        categoryId: CategoryIdSchema.nullable().optional(),
        categoryIds: z.array(CategoryIdSchema).max(50).optional(),
        taskId: TaskIdSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    // Resolve the desired category set. Prefer plural; fall back to legacy single.
    const targetIds: string[] = data.categoryIds
      ? Array.from(new Set(data.categoryIds))
      : data.categoryId
        ? [data.categoryId]
        : [];

    // Snapshot prior assignments so we can diff for audit + know the affected task.
    const priorRes = await supabase
      .from("task_attachment_categories")
      .select("attachment_id, category_id")
      .in("attachment_id", data.fileIds);
    if (priorRes.error) throw new Error(priorRes.error.message);
    const prior = (priorRes.data ?? []) as Array<{ attachment_id: string; category_id: string }>;
    const priorByCat = new Map<string, Set<string>>();
    for (const r of prior) {
      if (!priorByCat.has(r.category_id)) priorByCat.set(r.category_id, new Set());
      priorByCat.get(r.category_id)!.add(r.attachment_id);
    }

    // Sync legacy single column for backward compat (first category, else null).
    const legacy = targetIds[0] ?? null;
    const upd = await supabase
      .from("task_attachments")
      .update({ category_id: legacy })
      .in("id", data.fileIds);
    if (upd.error) throw new Error(upd.error.message);

    // Replace all assignments for the affected files.
    const del = await supabase
      .from("task_attachment_categories")
      .delete()
      .in("attachment_id", data.fileIds);
    if (del.error) throw new Error(del.error.message);

    if (targetIds.length) {
      const fileIds = Array.from(new Set(data.fileIds));
      const rows = fileIds.flatMap((fid) =>
        targetIds.map((cid) => ({ attachment_id: fid, category_id: cid })),
      );
      const ins = await supabase
        .from("task_attachment_categories")
        .upsert(rows, { onConflict: "attachment_id,category_id", ignoreDuplicates: true });
      if (ins.error) throw new Error(ins.error.message);
    }

    // Audit — diff per category, batched (one row per category that changed).
    if (data.taskId) {
      const newSet = new Set(targetIds);
      const allCats = new Set<string>([...newSet, ...priorByCat.keys()]);
      const fileIdSet = new Set(data.fileIds);
      const catNames = new Map<string, string>();
      if (allCats.size) {
        const { data: cs } = await supabase
          .from("project_file_categories")
          .select("id, name")
          .in("id", Array.from(allCats));
        for (const c of (cs ?? []) as Array<{ id: string; name: string }>) {
          catNames.set(c.id, c.name);
        }
      }
      for (const catId of allCats) {
        const wasOn = priorByCat.get(catId) ?? new Set<string>();
        // After the replace, every fileId either has catId (if in newSet) or doesn't.
        if (newSet.has(catId)) {
          // Assigned to files that didn't previously have it.
          const added = data.fileIds.filter((f) => !wasOn.has(f));
          if (added.length) {
            await writeTaskAudit(supabase, data.taskId, "category_assigned", {
              category_id: catId,
              name: catNames.get(catId) ?? null,
              file_ids: added,
              count: added.length,
            });
          }
        } else {
          // Removed from files that had it before.
          const removed = data.fileIds.filter((f) => wasOn.has(f) && fileIdSet.has(f));
          if (removed.length) {
            await writeTaskAudit(supabase, data.taskId, "category_unassigned", {
              category_id: catId,
              name: catNames.get(catId) ?? null,
              file_ids: removed,
              count: removed.length,
            });
          }
        }
      }
    }

    return { ok: true };
  });

/** Atomic-ish create-and-assign for the picker's "Create '…' and apply" flow.
 *  Single handler so the client gets one success/failure rather than a split
 *  state where the category is created but not assigned. */
export const createAndAssignProjectFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: ProjectIdSchema.optional(),
        taskId: TaskIdSchema.optional(),
        name: NameSchema,
        color: HexColorSchema.optional().default("#6366f1"),
        fileIds: z.array(FileIdSchema).min(1).max(500),
        existingCategoryIds: z.array(CategoryIdSchema).max(50).optional().default([]),
        mode: z.enum(["add", "replace"]).optional().default("add"),
      })
      .refine((v) => v.projectId || v.taskId, "projectId or taskId required")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    let projectId = data.projectId;
    if (!projectId && data.taskId) {
      projectId = (await resolveProjectIdFromTask(supabase, data.taskId)) ?? undefined;
    }
    if (!projectId) throw new Error("Could not resolve project for this task");

    // 1. Resolve or create the category (idempotent on case-insensitive name).
    let category = await findCategoryByName(supabase, projectId, data.name);
    let createdNow = false;
    if (!category) {
      const ins = await supabase
        .from("project_file_categories")
        .insert({
          project_id: projectId,
          name: data.name,
          color: data.color,
          created_by: userId,
        })
        .select("id, project_id, name, color, sort_order, is_active")
        .single();
      if (ins.error) {
        // Race: another caller created the row between our SELECT and INSERT.
        if (`${ins.error.message}`.toLowerCase().includes("duplicate")) {
          category = await findCategoryByName(supabase, projectId, data.name);
        }
        if (!category) throw new Error(ins.error.message);
      } else {
        category = ins.data as ProjectFileCategory;
        createdNow = true;
      }
    }

    // 2. Compute target set per file.
    const fileIds = Array.from(new Set(data.fileIds));
    const targetIds =
      data.mode === "replace"
        ? [category.id]
        : Array.from(new Set([...(data.existingCategoryIds ?? []), category.id]));

    // 3. Sync legacy column.
    const upd = await supabase
      .from("task_attachments")
      .update({ category_id: targetIds[0] ?? null })
      .in("id", fileIds);
    if (upd.error) throw new Error(upd.error.message);

    // 4. Insert assignments. In "replace" mode we delete-then-insert; in "add"
    //    mode we just upsert the new category row(s) so existing assignments stay.
    if (data.mode === "replace") {
      const del = await supabase
        .from("task_attachment_categories")
        .delete()
        .in("attachment_id", fileIds);
      if (del.error) throw new Error(del.error.message);
    }
    const rows = fileIds.flatMap((fid) =>
      targetIds.map((cid) => ({ attachment_id: fid, category_id: cid })),
    );
    if (rows.length) {
      const ins = await supabase
        .from("task_attachment_categories")
        .upsert(rows, { onConflict: "attachment_id,category_id", ignoreDuplicates: true });
      if (ins.error) throw new Error(ins.error.message);
    }

    // 5. Audit.
    if (createdNow) {
      await writeTaskAudit(supabase, data.taskId, "category_created", {
        category_id: category.id,
        name: category.name,
        color: category.color,
      });
    }
    await writeTaskAudit(supabase, data.taskId, "category_assigned", {
      category_id: category.id,
      name: category.name,
      file_ids: fileIds,
      count: fileIds.length,
    });

    return { ok: true, category, createdNow };
  });

export const listArchivedTaskDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ taskId: TaskIdSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: rows, error } = await supabase
      .from("task_attachments")
      .select(
        "id, task_id, folder_path, filename, size_bytes, mime_type, storage_path, created_at, is_client_visible, client_visible_override, uploader_id, category_id, description, archived_at",
      )
      .eq("task_id", data.taskId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<TaskFileRow & { archived_at: string }>;
    const ids = list.map((f) => f.id);
    const catMap = new Map<string, string[]>();
    if (ids.length) {
      const { data: assigns, error: ae } = await supabase
        .from("task_attachment_categories")
        .select("attachment_id, category_id")
        .in("attachment_id", ids);
      if (ae) throw new Error(ae.message);
      for (const a of (assigns ?? []) as Array<{ attachment_id: string; category_id: string }>) {
        const arr = catMap.get(a.attachment_id) ?? [];
        arr.push(a.category_id);
        catMap.set(a.attachment_id, arr);
      }
    }
    return list.map((f) => ({
      ...f,
      category_ids: catMap.get(f.id) ?? (f.category_id ? [f.category_id] : []),
    }));
  });

export const archiveTaskFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fileIds: z.array(FileIdSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("task_attachments")
      .update({ archived_at: new Date().toISOString() })
      .in("id", data.fileIds);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.fileIds.length };
  });

export const restoreTaskFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fileIds: z.array(FileIdSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("task_attachments")
      .update({ archived_at: null })
      .in("id", data.fileIds);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.fileIds.length };
  });

export const setTaskFileDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        fileId: FileIdSchema,
        description: z.string().trim().max(500).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("task_attachments")
      .update({ description: data.description ?? null })
      .eq("id", data.fileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
