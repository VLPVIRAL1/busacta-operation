// Server functions for the Folder Library: firm-managed templates that can
// be deployed into a task's folder tree.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildProfileLabelMap } from "@/lib/shared/profile-name";

const TemplateIdSchema = z.string().uuid();
const FirmIdSchema = z.string().uuid();
const ProjectIdSchema = z.string().uuid();
const TaskIdSchema = z.string().uuid();
const NodeIdSchema = z.string().uuid();
const NameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^\\/\\\n\r]+$/, "Name cannot contain slashes");
const PathSchema = z
  .string()
  .max(1024)
  .regex(/^([^\\/\n\r]+(\/[^\\/\n\r]+)*)?$/, "Invalid folder path")
  .transform((s) => s.replace(/^\/+|\/+$/g, ""));

const PROJECT_TYPES = [
  "accounting",
  "tax_preparation",
  "sales_tax",
  "company_formation",
  "payroll_processing",
  "other",
  "auditing",
] as const;
const ProjectTypeSchema = z.enum(PROJECT_TYPES);

export type FolderTemplateNode = {
  id: string;
  template_id: string;
  parent_node_id: string | null;
  name: string;
  sort_order: number;
  children?: FolderTemplateNode[];
};

export type FolderTemplate = {
  id: string;
  firm_id: string;
  name: string;
  description: string | null;
  project_types: string[];
  is_active: boolean;
  updated_at: string;
  node_count?: number;
  nodes?: FolderTemplateNode[];
};

export type DeploymentRow = {
  id: string;
  template_name_snapshot: string;
  actor_id: string | null;
  actor_name: string | null;
  scope: "task" | "project";
  task_id: string | null;
  project_id: string | null;
  target_path: string;
  mode: "merge" | "replace";
  folders_created: number;
  folders_skipped: number;
  tasks_touched: number;
  is_client_visible: boolean;
  occurred_at: string;
};

async function getCurrentFirmId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("firm_id").eq("id", userId).single();
  if (!data?.firm_id) throw new Error("User is not associated with a firm");
  return data.firm_id as string;
}

async function getProjectFirmAndType(
  supabase: any,
  projectId: string,
): Promise<{ firm_id: string; project_type: string }> {
  const { data, error } = await supabase
    .from("projects")
    .select("firm_id, project_type")
    .eq("id", projectId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Project not found");
  return data;
}

async function resolveTaskContext(
  supabase: any,
  taskId: string,
): Promise<{ firm_id: string; project_id: string; project_type: string }> {
  const { data, error } = await supabase
    .from("tasks")
    .select("client_entities(project_id, projects(firm_id, project_type))")
    .eq("id", taskId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Task not found");
  const pid = data?.client_entities?.project_id;
  const firm = data?.client_entities?.projects?.firm_id;
  const ptype = data?.client_entities?.projects?.project_type;
  if (!pid || !firm) throw new Error("Task is not linked to a project");
  return { firm_id: firm, project_id: pid, project_type: ptype };
}

function buildNodeTree(rows: FolderTemplateNode[]): FolderTemplateNode[] {
  const byId = new Map<string, FolderTemplateNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  const roots: FolderTemplateNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_node_id && byId.has(r.parent_node_id)) {
      byId.get(r.parent_node_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (arr: FolderTemplateNode[]) => {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    for (const n of arr) if (n.children?.length) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const listFolderTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: ProjectIdSchema.optional(),
        firmId: FirmIdSchema.optional(),
        includeInactive: z.boolean().optional().default(false),
        filterToProjectType: z.boolean().optional().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    let firmId = data.firmId;
    let projectType: string | null = null;
    if (data.projectId) {
      const ctx = await getProjectFirmAndType(supabase, data.projectId);
      firmId = ctx.firm_id;
      projectType = ctx.project_type;
    }
    if (!firmId) {
      // Super-admins may have no firm_id on their profile; fall back to all firms.
      const { data: prof } = await supabase
        .from("profiles")
        .select("firm_id")
        .eq("id", userId)
        .single();
      if (prof?.firm_id) {
        firmId = prof.firm_id as string;
      } else {
        const { data: isSuper } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "super_admin",
        });
        if (!isSuper) throw new Error("User is not associated with a firm");
        // firmId stays undefined -> no firm filter applied below
      }
    }
    let q = supabase
      .from("folder_library_templates")
      .select(
        "id, firm_id, name, description, project_types, is_active, updated_at, folder_library_template_nodes(id)",
      )
      .order("name", { ascending: true });
    if (firmId) q = q.eq("firm_id", firmId);
    if (!data.includeInactive) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let out = ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      firm_id: r.firm_id,
      name: r.name,
      description: r.description,
      project_types: r.project_types ?? [],
      is_active: r.is_active,
      updated_at: r.updated_at,
      node_count: (r.folder_library_template_nodes ?? []).length,
    })) as FolderTemplate[];
    if (data.filterToProjectType && projectType) {
      out = out.filter(
        (t) => t.project_types.length === 0 || t.project_types.includes(projectType!),
      );
    }
    return out;
  });

export const getFolderTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ templateId: TemplateIdSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: tpl, error } = await supabase
      .from("folder_library_templates")
      .select("id, firm_id, name, description, project_types, is_active, updated_at")
      .eq("id", data.templateId)
      .single();
    if (error || !tpl) throw new Error(error?.message ?? "Template not found");
    const { data: nodes } = await supabase
      .from("folder_library_template_nodes")
      .select("id, template_id, parent_node_id, name, sort_order")
      .eq("template_id", data.templateId)
      .order("sort_order", { ascending: true });
    const tree = buildNodeTree((nodes ?? []) as FolderTemplateNode[]);
    return {
      ...tpl,
      project_types: tpl.project_types ?? [],
      nodes: tree,
    } as FolderTemplate;
  });

// ---------------------------------------------------------------------------
// Write (admin)
// ---------------------------------------------------------------------------

const NodeInputSchema: z.ZodType<{ name: string; children?: any[] }> = z.lazy(() =>
  z.object({
    name: NameSchema,
    children: z.array(NodeInputSchema).max(50).optional(),
  }),
);

export const createFolderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: FirmIdSchema.optional(),
        name: NameSchema,
        description: z.string().trim().max(500).optional().nullable(),
        projectTypes: z.array(ProjectTypeSchema).max(10).optional().default([]),
        nodes: z.array(NodeInputSchema).max(50).optional().default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const firmId = data.firmId ?? (await getCurrentFirmId(supabase, userId));
    const { data: tpl, error } = await supabase
      .from("folder_library_templates")
      .insert({
        firm_id: firmId,
        name: data.name,
        description: data.description ?? null,
        project_types: data.projectTypes,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) {
      if (`${error.message}`.toLowerCase().includes("duplicate")) {
        throw new Error(`A template named "${data.name}" already exists`);
      }
      throw new Error(error.message);
    }
    await insertNodeTree(supabase, tpl.id, null, data.nodes ?? []);
    return { id: tpl.id as string };
  });

async function insertNodeTree(
  supabase: any,
  templateId: string,
  parentId: string | null,
  nodes: Array<{ name: string; children?: any[] }>,
) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const { data, error } = await supabase
      .from("folder_library_template_nodes")
      .insert({
        template_id: templateId,
        parent_node_id: parentId,
        name: n.name,
        sort_order: i + 1,
      })
      .select("id")
      .single();
    if (error) {
      if (`${error.message}`.toLowerCase().includes("duplicate")) {
        throw new Error(`Duplicate sibling folder "${n.name}"`);
      }
      throw new Error(error.message);
    }
    if (n.children?.length) {
      await insertNodeTree(supabase, templateId, data.id, n.children);
    }
  }
}

export const updateFolderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        templateId: TemplateIdSchema,
        name: NameSchema.optional(),
        description: z.string().trim().max(500).nullable().optional(),
        projectTypes: z.array(ProjectTypeSchema).max(10).optional(),
        isActive: z.boolean().optional(),
        nodes: z.array(NodeInputSchema).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.projectTypes !== undefined) patch.project_types = data.projectTypes;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (Object.keys(patch).length) {
      const { error } = await supabase
        .from("folder_library_templates")
        .update(patch)
        .eq("id", data.templateId);
      if (error) throw new Error(error.message);
    }
    if (data.nodes !== undefined) {
      // Replace node tree wholesale
      await supabase
        .from("folder_library_template_nodes")
        .delete()
        .eq("template_id", data.templateId);
      await insertNodeTree(supabase, data.templateId, null, data.nodes);
    }
    return { ok: true };
  });

export const deactivateFolderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ templateId: TemplateIdSchema, isActive: z.boolean().optional().default(false) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("folder_library_templates")
      .update({ is_active: data.isActive })
      .eq("id", data.templateId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

function flattenNodes(
  nodes: FolderTemplateNode[],
  basePath: string,
): Array<{ path: string; depth: number }> {
  const out: Array<{ path: string; depth: number }> = [];
  const walk = (arr: FolderTemplateNode[], parent: string, depth: number) => {
    for (const n of arr) {
      const full = parent ? `${parent}/${n.name}` : n.name;
      out.push({ path: full, depth });
      if (n.children?.length) walk(n.children, full, depth + 1);
    }
  };
  const root = basePath.replace(/^\/+|\/+$/g, "");
  walk(nodes, root, 0);
  out.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
  return out;
}

async function deployToOneTask(
  supabase: any,
  userId: string,
  taskId: string,
  template: FolderTemplate,
  basePath: string,
  mode: "merge" | "replace",
): Promise<{ created: number; skipped: number; existingTopFolders: string[] }> {
  const root = basePath.replace(/^\/+|\/+$/g, "");
  const flat = flattenNodes(template.nodes ?? [], root);

  // Existing folder paths on this task
  const { data: existingRows } = await supabase
    .from("task_document_folders")
    .select("id, path")
    .eq("task_id", taskId);
  const existing = new Set<string>(
    ((existingRows ?? []) as Array<{ path: string }>).map((r) => r.path),
  );

  const topFolders = (template.nodes ?? []).map((n) => (root ? `${root}/${n.name}` : n.name));

  if (mode === "replace") {
    for (const top of topFolders) {
      const prefix = `${top}/`;
      // Delete files
      const { data: files } = await supabase
        .from("task_attachments")
        .select("id, storage_path, folder_path")
        .eq("task_id", taskId)
        .is("archived_at", null);
      const toRemove = (
        (files ?? []) as Array<{ id: string; storage_path: string; folder_path: string }>
      ).filter((f) => f.folder_path === top || f.folder_path.startsWith(prefix));
      if (toRemove.length) {
        const paths = toRemove.map((f) => f.storage_path).filter(Boolean);
        if (paths.length) await supabase.storage.from("task-attachments").remove(paths);
        await supabase
          .from("task_attachments")
          .update({ archived_at: new Date().toISOString() })
          .in(
            "id",
            toRemove.map((f) => f.id),
          );
      }
      // Delete folder rows
      const { data: folderRows } = await supabase
        .from("task_document_folders")
        .select("id, path")
        .eq("task_id", taskId);
      const ids = ((folderRows ?? []) as Array<{ id: string; path: string }>)
        .filter((f) => f.path === top || f.path.startsWith(prefix))
        .map((f) => f.id);
      if (ids.length) {
        await supabase.from("task_document_folders").delete().in("id", ids);
      }
      existing.delete(top);
      for (const p of [...existing]) if (p.startsWith(prefix)) existing.delete(p);
    }
  }

  let created = 0;
  let skipped = 0;
  for (const entry of flat) {
    if (existing.has(entry.path)) {
      skipped++;
      continue;
    }
    const { error } = await supabase
      .from("task_document_folders")
      .insert({ task_id: taskId, path: entry.path, created_by: userId });
    if (error) {
      if (`${error.message}`.toLowerCase().includes("duplicate")) {
        skipped++;
        continue;
      }
      throw new Error(error.message);
    }
    existing.add(entry.path);
    created++;
  }
  return { created, skipped, existingTopFolders: topFolders.filter((p) => existing.has(p)) };
}

export const deployTemplateToTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        taskId: TaskIdSchema,
        templateId: TemplateIdSchema,
        basePath: PathSchema.optional().default(""),
        mode: z.enum(["merge", "replace"]).optional().default("merge"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const taskCtx = await resolveTaskContext(supabase, data.taskId);

    // Load template (with nodes)
    const { data: tpl, error: tplErr } = await supabase
      .from("folder_library_templates")
      .select("id, firm_id, name, description, project_types, is_active, updated_at")
      .eq("id", data.templateId)
      .single();
    if (tplErr || !tpl) throw new Error(tplErr?.message ?? "Template not found");
    if (tpl.firm_id !== taskCtx.firm_id) throw new Error("Template belongs to a different firm");
    const { data: nodes } = await supabase
      .from("folder_library_template_nodes")
      .select("id, template_id, parent_node_id, name, sort_order")
      .eq("template_id", data.templateId);
    const template: FolderTemplate = {
      ...tpl,
      project_types: tpl.project_types ?? [],
      nodes: buildNodeTree((nodes ?? []) as FolderTemplateNode[]),
    };

    const result = await deployToOneTask(
      supabase,
      userId,
      data.taskId,
      template,
      data.basePath,
      data.mode,
    );

    // Determine client visibility of the deploy root (any top folder client-visible?)
    let clientVisible = false;
    if (result.existingTopFolders.length) {
      const { data: visRows } = await supabase
        .from("task_document_folders")
        .select("is_client_visible")
        .eq("task_id", data.taskId)
        .in("path", result.existingTopFolders);
      clientVisible = ((visRows ?? []) as Array<{ is_client_visible: boolean }>).some(
        (r) => r.is_client_visible,
      );
    }

    await supabase.from("folder_template_deployments").insert({
      firm_id: taskCtx.firm_id,
      template_id: data.templateId,
      template_name_snapshot: tpl.name,
      actor_id: userId,
      scope: "task",
      task_id: data.taskId,
      project_id: taskCtx.project_id,
      target_path: data.basePath,
      mode: data.mode,
      folders_created: result.created,
      folders_skipped: result.skipped,
      tasks_touched: 1,
      is_client_visible: clientVisible,
    });

    return { foldersCreated: result.created, foldersSkipped: result.skipped };
  });

export const applyTemplateToProjectTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: ProjectIdSchema,
        templateId: TemplateIdSchema,
        basePath: PathSchema.optional().default(""),
        mode: z.enum(["merge", "replace"]).optional().default("merge"),
        pipelineStageKey: z.string().max(80).optional().nullable(),
        entityId: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const proj = await getProjectFirmAndType(supabase, data.projectId);

    // Resolve target tasks via client_entities → tasks
    let entityQ = supabase.from("client_entities").select("id").eq("project_id", data.projectId);
    if (data.entityId) entityQ = entityQ.eq("id", data.entityId);
    const { data: entities } = await entityQ;
    const entityIds = ((entities ?? []) as Array<{ id: string }>).map((e) => e.id);
    if (!entityIds.length) {
      return { tasksTouched: 0, foldersCreated: 0, foldersSkipped: 0 };
    }
    const taskQ = supabase.from("tasks").select("id").in("entity_id", entityIds);
    const { data: tasks } = await taskQ;
    const taskIds = ((tasks ?? []) as Array<{ id: string }>).map((t) => t.id);
    if (!taskIds.length) {
      return { tasksTouched: 0, foldersCreated: 0, foldersSkipped: 0 };
    }

    // Load template once
    const { data: tpl, error: tplErr } = await supabase
      .from("folder_library_templates")
      .select("id, firm_id, name, project_types, is_active, updated_at, description")
      .eq("id", data.templateId)
      .single();
    if (tplErr || !tpl) throw new Error(tplErr?.message ?? "Template not found");
    if (tpl.firm_id !== proj.firm_id) throw new Error("Template belongs to a different firm");
    const { data: nodes } = await supabase
      .from("folder_library_template_nodes")
      .select("id, template_id, parent_node_id, name, sort_order")
      .eq("template_id", data.templateId);
    const template: FolderTemplate = {
      ...tpl,
      project_types: tpl.project_types ?? [],
      nodes: buildNodeTree((nodes ?? []) as FolderTemplateNode[]),
    };

    let totalCreated = 0;
    let totalSkipped = 0;
    let touched = 0;
    for (const tid of taskIds) {
      try {
        const r = await deployToOneTask(supabase, userId, tid, template, data.basePath, data.mode);
        totalCreated += r.created;
        totalSkipped += r.skipped;
        touched++;
      } catch (e) {
        // Continue with other tasks; failures are reflected in the totals
        // by simply not incrementing this task's count.

        console.error("deploy failed for task", tid, e);
      }
    }

    await supabase.from("folder_template_deployments").insert({
      firm_id: proj.firm_id,
      template_id: data.templateId,
      template_name_snapshot: tpl.name,
      actor_id: userId,
      scope: "project",
      task_id: null,
      project_id: data.projectId,
      target_path: data.basePath,
      mode: data.mode,
      folders_created: totalCreated,
      folders_skipped: totalSkipped,
      tasks_touched: touched,
      is_client_visible: false,
    });

    return { tasksTouched: touched, foldersCreated: totalCreated, foldersSkipped: totalSkipped };
  });

export const listTemplateDeployments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firmId: FirmIdSchema.optional(),
        templateId: TemplateIdSchema.optional(),
        taskId: TaskIdSchema.optional(),
        projectId: ProjectIdSchema.optional(),
        limit: z.number().int().min(1).max(200).optional().default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const firmId = data.firmId ?? (await getCurrentFirmId(supabase, userId));
    let q = supabase
      .from("folder_template_deployments")
      .select(
        "id, template_name_snapshot, actor_id, scope, task_id, project_id, target_path, mode, folders_created, folders_skipped, tasks_touched, is_client_visible, occurred_at",
      )
      .eq("firm_id", firmId)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.templateId) q = q.eq("template_id", data.templateId);
    if (data.taskId) q = q.eq("task_id", data.taskId);
    if (data.projectId) q = q.eq("project_id", data.projectId);
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
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      nameMap = buildProfileLabelMap(
        (profs ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>,
      );
    }
    return ((rows ?? []) as Array<Omit<DeploymentRow, "actor_name">>).map((r) => ({
      ...r,
      actor_name: r.actor_id ? (nameMap.get(r.actor_id) ?? "Unknown") : "System",
    })) as DeploymentRow[];
  });
