import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyKeysetDesc, hasMore, nextCursorFrom, PAGE_SIZE, type Cursor } from "@/lib/ops/keyset";

/**
 * Read queries for the Ops hub. Mutations stay co-located with their
 * optimistic-update logic in the route components for now — extract here
 * once a shared callsite needs them.
 */

// Returned shape is wide on purpose; route files cast to their richer
// `TaskRow`-style types that include UI-narrowed unions like StageKey.
export const pipelineTasksQuery = () =>
  queryOptions({
    queryKey: ["pipeline-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, description, pipeline_stage, pipeline_stage_id, priority, due_date, sharepoint_url, assignee_id, reviewer_id, task_type_id, created_at, client_entities(id, name, project_id, projects(id, name, slug, firm_id, project_type, firms(id, name))), direct_client_task_types!tasks_task_type_id_fkey(id, label)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export type PipelineProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export const pipelineProfilesQuery = () =>
  queryOptions({
    queryKey: ["pipeline-profiles"],
    queryFn: async (): Promise<PipelineProfile[]> => {
      // Assignee/Reviewer pickers must only show active internal employees.
      // Filtering by provisioned_via='hr_hub' excludes client contacts,
      // B2B firm profile rows, and any other externally-provisioned users.
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("provisioned_via" as never, "hr_hub" as never)
        .eq("status", "active")
        .order("full_name", { ascending: true });
      return (data ?? []) as PipelineProfile[];
    },
  });

export type PipelineEntityOption = {
  id: string;
  name: string;
  projects: { id: string; name: string; firms: { name: string } | null } | null;
};

export const pipelineEntitiesQuery = () =>
  queryOptions({
    queryKey: ["pipeline-entities"],
    queryFn: async (): Promise<PipelineEntityOption[]> => {
      const { data } = await supabase
        .from("client_entities")
        .select("id, name, projects(id, name, firms(name))")
        .order("name");
      return (data ?? []) as PipelineEntityOption[];
    },
  });

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  task_id: string | null;
  project_id: string | null;
  firm_id: string | null;
  read_at: string | null;
  is_pinned: boolean;
  created_at: string;
  firms?: { id: string; name: string | null; firm_identifier: string | null } | null;
  projects?: { id: string; name: string | null; code: string | null } | null;
}

/**
 * Up to 200 most-recent notifications for one user, pinned first.
 * Mutations (mark read / pin / delete) live in the route — they share
 * optimistic-update state with local UI.
 */
export const notificationsInboxQuery = (userId: string) =>
  queryOptions({
    queryKey: ["notifications-inbox", userId],
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, kind, title, body, url, task_id, project_id, firm_id, read_at, is_pinned, created_at, firms(id, name, firm_identifier), projects(id, name, code)",
        )
        .eq("user_id", userId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as NotificationRow[];
    },
  });

// ───────── Todos ─────────
export type TodoRow = {
  id: string;
  display_id: string | null;
  project_id: string | null;
  title: string;
  status: string;
  priority: string;
  complexity: string;
  period: string | null;
  due_date: string | null;
  start_date: string | null;
  tax_year: number | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  entity_id: string | null;
  client_id: string | null;
  stream: "cpa" | "direct";
  direct_client_id: string | null;
  direct_clients: { id: string; display_name: string; client_code: string } | null;
  pipeline_stage_id: string | null;
  pipeline_stage: string | null;
  project_pipeline_stages: {
    id: string;
    label: string;
    key: string;
    primary_state: string;
    color: string | null;
  } | null;
  client_entities: {
    name: string;
    client_id: string | null;
    project_id: string;
    projects: {
      id: string;
      name: string;
      code?: string | null;
      firm_id: string;
      firms: { id: string; name: string; firm_identifier?: string | null } | null;
    } | null;
  } | null;
  task_assignees: { user_id: string; role: string }[] | null;
  task_subtasks: { is_done: boolean }[] | null;
  /** User-defined position within its Firm/Project group in the To-Do list. NULL = unordered. */
  sort_order: number | null;
};

export const todosQuery = (userId: string | undefined, role: string | null | undefined) =>
  queryOptions({
    queryKey: ["todos", userId, role],
    enabled: !!userId,
    queryFn: async (): Promise<TodoRow[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, display_id, project_id, title, status, priority, complexity, period, due_date, start_date, tax_year, assignee_id, reviewer_id, entity_id, client_id, stream, direct_client_id, pipeline_stage_id, pipeline_stage, sort_order, direct_clients(id, display_name, client_code), project_pipeline_stages(id, label, key, primary_state, color), client_entities(name, client_id, project_id, projects(id, name, code, firm_id, firms(id, name, firm_identifier))), task_assignees(user_id, role), task_subtasks(is_done)",
        )
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TodoRow[];
    },
  });

/** Count of tasks directly assigned to `userId` that are not yet complete. Used for the dashboard badge. */
export const myActiveTodoCountQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["my-active-todo-count", userId],
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("assignee_id", userId!)
        .neq("status", "complete");
      if (error) throw error;
      return count ?? 0;
    },
  });

/** Load one task with everything needed by the create/edit modal. */
export const taskByIdQuery = (taskId: string | undefined) =>
  queryOptions({
    queryKey: ["task-full", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, display_id, title, priority, status, period, tax_year, complexity, difficulty_level_id, urgency_level_id, start_date, due_date, return_type_id, entity_id, client_id, pipeline_stage_id, client_entities(id, name, client_id, project_id, projects(id, name, code, firm_id)), task_assignees(user_id, role)",
        )
        .eq("id", taskId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

/** Update a task with the same field-set produced by createWorkItem. */
export async function updateWorkItem(input: {
  taskId: string;
  title: string;
  priority: string;
  period: WorkItemPeriod | null;
  taxYear: number | null;
  complexity: WorkItemComplexity;
  startDate: string;
  dueDate: string;
  assigneeIds: string[];
  reviewerIds: string[];
  returnTypeId?: string | null;
  status?: string | null;
  /** Project-configured difficulty/urgency level ids (null clears). */
  difficultyLevelId?: string | null;
  urgencyLevelId?: string | null;
  /** When provided, replaces all custom-field values for the task. */
  customFieldValues?: { fieldDefId: string; value: unknown }[];
  /** Optional: allow re-linking the task to a different firm-level client. */
  clientId?: string | null;
}): Promise<void> {
  const patch = {
    title: input.title,
    priority: input.priority,
    period: input.period,
    tax_year: input.taxYear,
    complexity: input.complexity,
    difficulty_level_id: input.difficultyLevelId ?? null,
    urgency_level_id: input.urgencyLevelId ?? null,
    start_date: input.startDate,
    due_date: input.dueDate,
    return_type_id: input.returnTypeId ?? null,
    assignee_id: input.assigneeIds[0] ?? null,
    reviewer_id: input.reviewerIds[0] ?? null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.clientId !== undefined ? { client_id: input.clientId } : {}),
  } as any;
  const { error } = await supabase.from("tasks").update(patch).eq("id", input.taskId);
  if (error) throw error;
  // Replace people on both roles
  await replaceTaskPeople({ taskId: input.taskId, role: "assignee", userIds: input.assigneeIds });
  await replaceTaskPeople({ taskId: input.taskId, role: "reviewer", userIds: input.reviewerIds });
  // Replace custom-field values (delete-then-insert keeps it simple & idempotent).
  if (input.customFieldValues) {
    await writeTaskCustomFieldValues(input.taskId, input.customFieldValues, true);
  }
}

/** Insert (or replace) custom-field values for a task. Skips empty values. */
async function writeTaskCustomFieldValues(
  taskId: string,
  values: { fieldDefId: string; value: unknown }[],
  replace: boolean,
): Promise<void> {
  if (replace) {
    const { error: delErr } = await supabase
      .from("project_custom_field_values")
      .delete()
      .eq("task_id", taskId);
    if (delErr) throw delErr;
  }
  const isEmpty = (v: unknown) =>
    v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  const rows = values
    .filter((v) => !isEmpty(v.value))
    .map((v) => ({ task_id: taskId, field_def_id: v.fieldDefId, value: v.value as never }));
  if (rows.length > 0) {
    const { error } = await supabase.from("project_custom_field_values").insert(rows);
    if (error) throw error;
  }
}

// Project pipeline stages across all projects — used by the To-Do table Stage editor.
export type PipelineStageRow = {
  id: string;
  project_id: string;
  label: string;
  key: string;
  primary_state: string;
  sort_order: number;
  color: string | null;
};
export const projectPipelineStagesAllQuery = () =>
  queryOptions({
    queryKey: ["pipeline-stages-all"],
    queryFn: async (): Promise<PipelineStageRow[]> => {
      const { data, error } = await supabase
        .from("project_pipeline_stages")
        .select("id, project_id, label, key, primary_state, sort_order, color")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PipelineStageRow[];
    },
  });

/** Patch arbitrary task scalar fields. RLS scopes who can succeed. */
export async function updateTaskField(taskId: string, patch: Record<string, unknown>) {
  // Strip empty-string values — they would violate enum columns (task_status etc.)
  // if a caller accidentally passes "" instead of null or a valid enum value.
  const safePatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== ""));
  if (Object.keys(safePatch).length === 0) return;

  const { error } = await supabase
    .from("tasks")
    .update(safePatch as any)
    .eq("id", taskId);
  if (error) throw error;
}

/** Replace all assignees/reviewers for a task and mirror the first one to tasks.assignee_id / reviewer_id. */
export async function replaceTaskPeople(input: {
  taskId: string;
  role: "assignee" | "reviewer";
  userIds: string[];
}) {
  const { taskId, role, userIds } = input;
  const { error: delErr } = await supabase
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("role", role);
  if (delErr) throw delErr;
  if (userIds.length > 0) {
    const rows = userIds.map((user_id) => ({ task_id: taskId, user_id, role }));
    const { error: insErr } = await supabase
      .from("task_assignees")
      .upsert(rows, { onConflict: "task_id,user_id,role" });
    if (insErr) throw insErr;
  }
  const mirrorCol = role === "assignee" ? "assignee_id" : "reviewer_id";
  // Dynamic column key — safe, only ever "assignee_id" or "reviewer_id".

  await supabase
    .from("tasks")
    .update({ [mirrorCol]: userIds[0] ?? null } as any)
    .eq("id", taskId);
}

/** Apply the same scalar patch to many tasks. Returns { ok, failed }. */
export async function bulkUpdateTaskFields(
  ids: string[],
  patch: Record<string, unknown>,
): Promise<{ ok: number; failed: { id: string; message: string }[] }> {
  const results = await Promise.allSettled(ids.map((id) => updateTaskField(id, patch)));
  const failed: { id: string; message: string }[] = [];
  let ok = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ok += 1;
    else failed.push({ id: ids[i], message: (r.reason as Error)?.message ?? "Failed" });
  });
  return { ok, failed };
}

/** Replace assignees or reviewers on many tasks. */
export async function bulkReplaceTaskPeople(input: {
  ids: string[];
  role: "assignee" | "reviewer";
  userIds: string[];
}): Promise<{ ok: number; failed: { id: string; message: string }[] }> {
  const { ids, role, userIds } = input;
  const results = await Promise.allSettled(
    ids.map((id) => replaceTaskPeople({ taskId: id, role, userIds })),
  );
  const failed: { id: string; message: string }[] = [];
  let ok = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ok += 1;
    else failed.push({ id: ids[i], message: (r.reason as Error)?.message ?? "Failed" });
  });
  return { ok, failed };
}

// ───────── Task views (saved column/filter/group configs) ─────────
export type TaskViewConfig = {
  columns?: { key: string; visible?: boolean; width?: number; order?: number }[];
  filters?: Record<string, unknown>;
  sort?: { key: string; dir: "asc" | "desc" }[];
  groupBy?: string | null;
  density?: "comfortable" | "compact";
  defaultScope?: "all" | "mine" | "unassigned";
};
export type TaskViewRow = {
  id: string;
  owner_id: string;
  name: string;
  scope: "private" | "public";
  config: TaskViewConfig;
  created_at: string;
  updated_at: string;
};

export const taskViewsQuery = () =>
  queryOptions({
    queryKey: ["task-views"],
    queryFn: async (): Promise<TaskViewRow[]> => {
      const { data, error } = await supabase
        .from("task_views" as never)
        .select("id, owner_id, name, scope, config, created_at, updated_at")
        .order("scope", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TaskViewRow[];
    },
  });

export async function saveTaskView(input: {
  id?: string;
  name: string;
  scope: "private" | "public";
  config: TaskViewConfig;
  ownerId: string;
}): Promise<string> {
  if (input.id) {
    const { error } = await supabase
      .from("task_views" as never)
      .update({ name: input.name, scope: input.scope, config: input.config } as never)
      .eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase
    .from("task_views" as never)
    .insert({
      owner_id: input.ownerId,
      name: input.name,
      scope: input.scope,
      config: input.config,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteTaskView(id: string) {
  const { error } = await supabase
    .from("task_views" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ───────── Workflow / Clarification / Email Templates ─────────
/** All three template categories share the workflow_templates table. */
export type TemplateCategory = "workflow" | "clarification" | "email";

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string | null;
  template: string | null;
  sort_order: number;
  /** Defaults to "workflow" for legacy rows that predate the category column. */
  category: TemplateCategory;
  email_subject: string | null;
  email_body: string | null;
};
export type TemplateChecklistItem = {
  id: string;
  workflow_template_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  template: string | null;
  /** Action-item kind for clarification templates; null for workflow items. */
  kind: string | null;
};

export const templatesQuery = () =>
  queryOptions({
    queryKey: ["templates"],
    queryFn: async () => {
      const [t, items] = await Promise.all([
        supabase.from("workflow_templates").select("*").order("sort_order").order("name"),
        supabase.from("template_checklist_items").select("*").order("sort_order"),
      ]);
      // Default category for legacy rows that predate the column.
      const templates = ((t.data ?? []) as unknown as WorkflowTemplate[]).map((tpl) => ({
        ...tpl,
        category: (tpl.category ?? "workflow") as TemplateCategory,
      }));
      return {
        templates,
        items: (items.data ?? []) as TemplateChecklistItem[],
      };
    },
  });

// ───────── Template scope (workflow templates) ─────────
export type TemplateScopeData = {
  firms: { id: string; name: string }[];
  projects: { id: string; name: string; firm_id: string; project_type: string }[];
  projectTypes: string[];
  linkedFirmIds: string[];
  linkedProjectIds: string[];
};

export const templateScopeQuery = (templateId: string) =>
  queryOptions({
    queryKey: ["template-scope-inline", templateId],
    queryFn: async (): Promise<TemplateScopeData> => {
      const [firms, projects, tpl, tplFirms, tplProjects] = await Promise.all([
        supabase.from("firms").select("id, name").order("name"),
        supabase.from("projects").select("id, name, firm_id, project_type").order("name"),
        supabase.from("workflow_templates").select("project_types").eq("id", templateId).single(),
        supabase.from("workflow_template_firms").select("firm_id").eq("template_id", templateId),
        supabase
          .from("workflow_template_projects")
          .select("project_id")
          .eq("template_id", templateId),
      ]);
      return {
        firms: (firms.data ?? []) as { id: string; name: string }[],
        projects: (projects.data ?? []) as {
          id: string;
          name: string;
          firm_id: string;
          project_type: string;
        }[],
        projectTypes: (tpl.data?.project_types ?? []) as string[],
        linkedFirmIds: (tplFirms.data ?? []).map((r) => r.firm_id),
        linkedProjectIds: (tplProjects.data ?? []).map((r) => r.project_id),
      };
    },
  });

export async function saveTemplateScope(input: {
  templateId: string;
  firmIds: string[];
  projectIds: string[];
  projectTypes: string[];
}) {
  const { templateId, firmIds, projectIds, projectTypes } = input;
  const d1 = await supabase.from("workflow_template_firms").delete().eq("template_id", templateId);
  if (d1.error) throw new Error(d1.error.message);
  const d2 = await supabase
    .from("workflow_template_projects")
    .delete()
    .eq("template_id", templateId);
  if (d2.error) throw new Error(d2.error.message);
  if (firmIds.length > 0) {
    const r = await supabase
      .from("workflow_template_firms")
      .insert(firmIds.map((firm_id) => ({ template_id: templateId, firm_id })));
    if (r.error) throw new Error(r.error.message);
  }
  if (projectIds.length > 0) {
    const r = await supabase
      .from("workflow_template_projects")
      .insert(projectIds.map((project_id) => ({ template_id: templateId, project_id })));
    if (r.error) throw new Error(r.error.message);
  }
  const u = await supabase
    .from("workflow_templates")
    .update({ project_types: projectTypes })
    .eq("id", templateId);
  if (u.error) throw new Error(u.error.message);
}

// ───────── Activity feed ─────────
export type AuditRow = {
  id: string;
  task_id: string;
  actor_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export const activityFeedQuery = () =>
  queryOptions({
    queryKey: ["activity-feed"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_audit")
        .select("id, task_id, actor_id, event_type, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as AuditRow[];
    },
  });

export const activityTasksQuery = (taskIds: string[]) =>
  queryOptions({
    queryKey: ["activity-tasks", ...taskIds],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select(
          "id, title, entity_id, client_entities(project_id, projects(id, name, code, firm_id, firms(id, name, firm_identifier)))",
        )
        .in("id", taskIds);
      return data ?? [];
    },
  });

export const activityProfilesQuery = (actorIds: string[]) =>
  queryOptions({
    queryKey: ["activity-profiles", ...actorIds],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      return data ?? [];
    },
  });

// ───────── Time logs ─────────
export const timeLogsQuery = (userId: string | undefined, role: string | null | undefined) =>
  queryOptions({
    queryKey: ["time-logs", userId, role],
    queryFn: async () => {
      let q = supabase
        .from("time_logs")
        .select(
          "id, task_id, started_at, ended_at, duration_minutes, note, user_id, billable, break_minutes, effective_minutes, effective_override, timer_group_size, tasks(title, entity_id, client_entities(project_id, projects(id, name, code, firm_id, firms(id, name, firm_identifier))))",
        )
        .order("started_at", { ascending: false })
        .limit(1000);
      if (role === "employee" && userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const tasksForLogQuery = () =>
  queryOptions({
    queryKey: ["tasks-for-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select(
          "id, title, client_entities(project_id, projects(id, name, code, firm_id, firms(id, name, firm_identifier)))",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

export const timelogProfilesQuery = () =>
  queryOptions({
    queryKey: ["timelog-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data ?? [];
    },
  });

export const timeLogAuditQuery = (timeLogId: string | null) =>
  queryOptions({
    queryKey: ["time-log-audit", timeLogId],
    enabled: !!timeLogId,
    queryFn: async () => {
      if (!timeLogId) return [];
      const { data, error } = await supabase
        .from("time_log_audit")
        .select("id, action, fields, before, after, bulk_op_id, created_at, actor_id")
        .eq("time_log_id", timeLogId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

// ───────── Reports ─────────
export type ReportLogRow = {
  user_id: string;
  duration_minutes: number | null;
  break_minutes: number | null;
  effective_minutes: number | null;
  effective_override: number | null;
  started_at: string;
  task_id: string;
  tasks: {
    client_entities: {
      projects: {
        id: string;
        name: string;
        firm_id: string;
        firms: { id: string; name: string } | null;
      } | null;
    } | null;
  } | null;
};

export const opsReportsQuery = () =>
  queryOptions({
    queryKey: ["reports"],
    queryFn: async () => {
      const [firms, projects, tasks, logs, profiles] = await Promise.all([
        supabase.from("firms").select("id, name"),
        supabase.from("projects").select("id, name, firm_id"),
        supabase
          .from("tasks")
          .select(
            "id, title, status, priority, entity_id, created_at, completed_at, ready_for_review_at, due_date, assignee_id, pipeline_stage, client_entities(project_id)",
          ),
        supabase
          .from("time_logs")
          .select(
            "user_id, duration_minutes, break_minutes, effective_minutes, effective_override, started_at, task_id, tasks(client_entities(projects(id, name, firm_id, firms(id, name))))",
          )
          .not("duration_minutes", "is", null),
        supabase.from("profiles").select("id, full_name, email, weekly_capacity_hours"),
      ]);
      return {
        firms: firms.data ?? [],
        projects: projects.data ?? [],
        tasks: tasks.data ?? [],
        logs: (logs.data ?? []) as unknown as ReportLogRow[],
        profiles: (profiles.data ?? []) as unknown as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
          weekly_capacity_hours: number;
        }>,
      };
    },
  });

// ───────── Projects (Ops, employee-facing, no pricing) ─────────
export const opsProjectsAllQuery = () =>
  queryOptions({
    queryKey: ["projects-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, project_type, status, firm_id, firms(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

// Command Center query: projects with aggregated telemetry (tasks done/total,
// open points count, assignees, soonest due date). Strictly omits any pricing,
// rates, fees, or budget data — Ops is execution-only.
export type OpsCommandCenterProject = {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  project_type: string;
  status: string;
  firm_id: string;
  firms: { id: string; name: string; firm_identifier: string | null } | null;
  client_entities: Array<{
    id: string;
    tasks: Array<{
      id: string;
      status: string;
      due_date: string | null;
      task_action_items: Array<{
        id: string;
        status: string;
        kind: string;
        deleted_at: string | null;
      }> | null;
      task_assignees: Array<{
        user_id: string;
        role: string;
        profiles: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
        } | null;
      }> | null;
    }> | null;
  }> | null;
};

export const opsProjectsCommandCenterQuery = () =>
  queryOptions({
    queryKey: ["projects-command-center"],
    queryFn: async (): Promise<OpsCommandCenterProject[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, name, slug, code, project_type, status, firm_id, firms(id, name, firm_identifier), client_entities(id, tasks(id, status, due_date, task_action_items(id, status, kind, deleted_at), task_assignees(user_id, role, profiles(id, full_name, avatar_url))))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OpsCommandCenterProject[];
    },
  });

// ───────── Firms (Ops workspace) ─────────
export type OpsFirm = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  us_timezone: string | null;
  firm_identifier: string | null;
  created_at: string;
};

export const opsFirmsListQuery = () =>
  queryOptions({
    queryKey: ["firms"],
    queryFn: async (): Promise<OpsFirm[]> => {
      const { data, error } = await supabase
        .from("firms")
        .select(
          "id, name, contact_email, contact_phone, notes, us_timezone, firm_identifier, created_at",
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OpsFirm[];
    },
  });

export type FirmsEmployeeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: string | null;
};

export const firmsEmployeeOptionsQuery = () =>
  queryOptions({
    queryKey: ["firms-employee-options"],
    queryFn: async (): Promise<FirmsEmployeeOption[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, status")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as FirmsEmployeeOption[]).filter(
        (e) => (e.status ?? "active") !== "inactive",
      );
    },
  });

export type FirmsTeamRow = { firm_id: string; user_id: string };

export const firmsTeamRowsQuery = () =>
  queryOptions({
    queryKey: ["firms-team-rows"],
    queryFn: async (): Promise<FirmsTeamRow[]> => {
      const { data, error } = await supabase.from("firm_internal_team").select("firm_id, user_id");
      if (error) throw error;
      return (data ?? []) as FirmsTeamRow[];
    },
  });

/* ---------- Shared filter-bar facet data ----------
 * Single source of truth for the firm / project / people option lists used by
 * the Ops filter bars (Todos, Open Points, Workload). Previously each bar
 * re-declared these `useQuery` blocks inline. Selecting the superset of columns
 * (firm_identifier, project code) lets every caller format picker labels. */

export type FilterFirmOption = { id: string; name: string; firm_identifier: string | null };

export const filterFirmsQuery = () =>
  queryOptions({
    queryKey: ["filter-firms"],
    staleTime: 60_000,
    queryFn: async (): Promise<FilterFirmOption[]> => {
      const { data } = await supabase
        .from("firms")
        .select("id, name, firm_identifier")
        .eq("status", "active")
        .order("name");
      return (data ?? []) as FilterFirmOption[];
    },
  });

export type FilterDirectClientOption = {
  id: string;
  display_name: string;
  client_code: string | null;
};

export const filterDirectClientsQuery = () =>
  queryOptions({
    queryKey: ["filter-direct-clients"],
    staleTime: 60_000,
    queryFn: async (): Promise<FilterDirectClientOption[]> => {
      const { data } = await supabase
        .from("direct_clients")
        .select("id, display_name, client_code")
        .eq("status", "active")
        .order("display_name");
      return (data ?? []) as FilterDirectClientOption[];
    },
  });

export type FilterProjectOption = { id: string; name: string; code: string | null };

export const filterProjectsQuery = (firmIds: string[]) =>
  queryOptions({
    queryKey: ["filter-projects", [...firmIds].sort().join(",")],
    staleTime: 60_000,
    queryFn: async (): Promise<FilterProjectOption[]> => {
      let q = supabase.from("projects").select("id, name, code").order("name");
      if (firmIds.length) q = q.in("firm_id", firmIds);
      const { data } = await q;
      return (data ?? []) as FilterProjectOption[];
    },
  });

export type FilterPersonOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export const filterPeopleQuery = () =>
  queryOptions({
    queryKey: ["filter-people"],
    staleTime: 60_000,
    queryFn: async (): Promise<FilterPersonOption[]> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .order("full_name")
        .limit(500);
      return (data ?? []) as FilterPersonOption[];
    },
  });

export type OpsFirmHeader = {
  id: string;
  name: string;
  contact_email: string | null;
  us_timezone: string | null;
  timezone: string | null;
  firm_identifier: string | null;
};

export const opsFirmHeaderQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["firm", firmId],
    queryFn: async (): Promise<OpsFirmHeader | null> => {
      const { data, error } = await supabase
        .from("firms")
        .select("id, name, contact_email, us_timezone, timezone, firm_identifier")
        .eq("id", firmId)
        .maybeSingle();
      if (error) throw error;
      return data as OpsFirmHeader | null;
    },
  });

export type FirmProjectRow = {
  id: string;
  slug: string | null;
  name: string;
  project_type: string;
  status: string;
  created_at: string;
  tasks_total: number;
  tasks_completed: number;
};

export const firmProjectsQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["firm-projects", firmId],
    queryFn: async (): Promise<FirmProjectRow[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, slug, name, project_type, status, created_at, client_entities(tasks(status))")
        .eq("firm_id", firmId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      type Raw = {
        id: string;
        slug: string | null;
        name: string;
        project_type: string;
        status: string;
        created_at: string;
        client_entities: { tasks: { status: string }[] | null }[] | null;
      };
      return (data ?? []).map((p) => {
        const r = p as Raw;
        const tasks = (r.client_entities ?? []).flatMap((e) => e.tasks ?? []);
        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          project_type: r.project_type,
          status: r.status,
          created_at: r.created_at,
          tasks_total: tasks.length,
          tasks_completed: tasks.filter((t) => t.status === "complete").length,
        };
      });
    },
  });

export type ProjectWorkspaceTask = {
  id: string;
  slug: string | null;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  pipeline_stage: string | null;
  entity_name: string;
  entity_id: string;
};

export const projectWorkspaceTasksQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-workspace-tasks", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectWorkspaceTask[]> => {
      const { data, error } = await supabase
        .from("client_entities")
        .select("id, name, tasks(id, slug, title, status, priority, due_date, pipeline_stage)")
        .eq("project_id", projectId)
        .order("name", { ascending: true });
      if (error) throw error;
      type Raw = {
        id: string;
        name: string;
        tasks:
          | {
              id: string;
              slug: string | null;
              title: string;
              status: string;
              priority: string | null;
              due_date: string | null;
              pipeline_stage: string | null;
            }[]
          | null;
      };
      return (data ?? []).flatMap((entity) => {
        const e = entity as Raw;
        return (e.tasks ?? []).map((t) => ({
          ...t,
          entity_name: e.name ?? "",
          entity_id: e.id,
        }));
      });
    },
  });

export type FirmUrgentTaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  client_entities: {
    id: string;
    name: string;
    project_id: string;
    projects: { id: string; name: string; firm_id: string } | null;
  } | null;
  subtasks_total: number;
  subtasks_completed: number;
  ai_total: number;
  ai_completed: number;
};

export const firmUrgentTasksQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["firm-urgent-tasks", firmId],
    queryFn: async (): Promise<FirmUrgentTaskRow[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, status, priority, due_date, client_entities!inner(id, name, project_id, projects!inner(id, name, firm_id)), task_subtasks(is_done), task_action_items(status, deleted_at)",
        )
        .eq("client_entities.projects.firm_id", firmId)
        .neq("status", "complete")
        .order("priority", { ascending: false })
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      type Raw = FirmUrgentTaskRow & {
        task_subtasks: { is_done: boolean }[] | null;
        task_action_items: { status: string; deleted_at: string | null }[] | null;
      };
      return (data ?? []).map((t) => {
        const r = t as unknown as Raw;
        const subs = r.task_subtasks ?? [];
        const ais = (r.task_action_items ?? []).filter((a) => !a.deleted_at);
        return {
          id: r.id,
          title: r.title,
          status: r.status,
          priority: r.priority,
          due_date: r.due_date,
          client_entities: r.client_entities,
          subtasks_total: subs.length,
          subtasks_completed: subs.filter((s) => s.is_done).length,
          ai_total: ais.length,
          ai_completed: ais.filter((a) => a.status === "done").length,
        };
      });
    },
  });

export const firmCompletedTasksQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["firm-completed-tasks", firmId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("tasks")
        .select("id, client_entities!inner(projects!inner(firm_id))", {
          count: "exact",
          head: true,
        })
        .eq("client_entities.projects.firm_id", firmId)
        .eq("status", "complete");
      if (error) throw error;
      return count ?? 0;
    },
  });

export const firmTotalHoursQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["firm-total-hours", firmId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("time_logs")
        .select(
          "duration_minutes, tasks!inner(entity_id, client_entities!inner(project_id, projects!inner(firm_id)))",
        )
        .eq("tasks.client_entities.projects.firm_id", firmId);
      if (error) throw error;
      return (data ?? []).reduce(
        (s, r) => s + ((r as { duration_minutes: number | null }).duration_minutes ?? 0),
        0,
      );
    },
  });

// ───────── Notifications mutations ─────────
export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

export async function setNotificationRead(id: string, read: boolean) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function setNotificationPinned(id: string, pinned: boolean) {
  const { error } = await supabase.from("notifications").update({ is_pinned: pinned }).eq("id", id);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw error;
}

// ───────── Projects (Ops) mutations ─────────
export async function updateOpsProject(input: {
  id: string;
  name: string;
  project_type: string;
  status: string;
}) {
  const { id, ...rest } = input;
  const { error } = await supabase
    .from("projects")
    // Scalar fields are plain strings here; cast past the generated enum unions.
    .update(rest as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteOpsProject(id: string) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ───────── Firms (Ops) mutations ─────────
export async function updateOpsFirm(input: {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
}) {
  const { id, ...rest } = input;
  const { error } = await supabase.from("firms").update(rest).eq("id", id);
  if (error) throw error;
}

export async function deleteOpsFirm(id: string) {
  const { error } = await supabase.from("firms").delete().eq("id", id);
  if (error) throw error;
}

export async function updateFirmInternalTeam(input: {
  firmId: string;
  nextIds: string[];
  prevIds: string[];
}) {
  const toAdd = input.nextIds.filter((id) => !input.prevIds.includes(id));
  const toRemove = input.prevIds.filter((id) => !input.nextIds.includes(id));
  if (toRemove.length) {
    const { error } = await supabase
      .from("firm_internal_team")
      .delete()
      .eq("firm_id", input.firmId)
      .in("user_id", toRemove);
    if (error) throw error;
  }
  if (toAdd.length) {
    const { error } = await supabase
      .from("firm_internal_team")
      .insert(toAdd.map((user_id) => ({ firm_id: input.firmId, user_id })));
    if (error) throw error;
  }
}

export const templateChecklistPreviewQuery = (template: string) =>
  queryOptions({
    queryKey: ["template-checklist-preview", template],
    enabled: template !== "none",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_checklist_items")
        .select("id, title, sort_order")
        .eq("template", template as never)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; sort_order: number }>;
    },
  });

// ───────── Entity detail page ─────────
export const entityDetailQuery = (entityId: string) =>
  queryOptions({
    queryKey: ["entity", entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_entities")
        .select(
          "id, name, slug, identifier, entity_type, software, project_id, client_id, projects(id, name, slug, code, firm_id, firms(id, name, firm_identifier))",
        )
        .eq("id", entityId)
        .single();
      if (error) throw error;
      return data;
    },
  });

// ───────── Slug → record resolvers (readable URLs) ─────────
// These intentionally carry NO app-level tenant filter — RLS is the single
// source of truth for tenant/role isolation. A slug the user may not see
// returns zero rows (null), and the route responds with a generic 404, so a
// probe cannot distinguish "missing" from "forbidden".

/** Resolve a project slug → row (id + crumb context). Null if not found/visible. */
export const projectBySlugQuery = (projectSlug: string) =>
  queryOptions({
    queryKey: ["project-by-slug", projectSlug],
    enabled: !!projectSlug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, slug, firm_id, firms(id, name)")
        .eq("slug", projectSlug)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        slug: string;
        firm_id: string;
        firms: { id: string; name: string } | null;
      } | null;
    },
  });

/** Resolve an entity slug within a project → row. Null if not found/visible. */
export const entityBySlugQuery = (projectId: string | undefined, entitySlug: string) =>
  queryOptions({
    queryKey: ["entity-by-slug", projectId, entitySlug],
    enabled: !!projectId && !!entitySlug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_entities")
        .select("id, name, slug, project_id")
        .eq("project_id", projectId!)
        .eq("slug", entitySlug)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string; slug: string; project_id: string } | null;
    },
  });

/** Resolve a (globally unique) task slug → row, with its entity/project context. */
export const taskBySlugQuery = (taskSlug: string) =>
  queryOptions({
    queryKey: ["task-by-slug", taskSlug],
    enabled: !!taskSlug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, slug, entity_id, project_id, client_entities(id, slug, project_id, projects(id, slug))",
        )
        .eq("slug", taskSlug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const projectReturnTypesQuery = (projectId: string | null) =>
  queryOptions({
    queryKey: ["project-return-types", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_return_types")
        .select("id, code, label, enabled")
        .eq("project_id", projectId!)
        .eq("enabled", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

// ───────── Project settings consumed by the create/edit task modal ─────────

/** Per-project task defaults + archived option lists (Project Settings → Task Type → Defaults). */
export type ProjectTaskDefaults = {
  default_task_type_id: string | null;
  default_priority: string | null;
  default_status: string | null;
  default_assignee_id: string | null;
  default_reviewer_id: string | null;
  archived_priorities: string[];
  archived_statuses: string[];
  /** Hours after creation a bulk-imported task's due date defaults to. Null → system default 48 h. */
  default_due_hours: number | null;
} | null;

export const projectTaskOptionsQuery = (projectId: string | null) =>
  queryOptions({
    queryKey: ["project-task-options", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectTaskDefaults> => {
      const { data, error } = await supabase
        .from("project_task_options")
        .select(
          "default_task_type_id, default_priority, default_status, default_assignee_id, default_reviewer_id, archived_priorities, archived_statuses, default_due_hours",
        )
        .eq("project_id", projectId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ProjectTaskDefaults) ?? null;
    },
  });

/** A configured Difficulty or Urgency level (enabled, not archived). */
export type ProjectLevelRow = {
  id: string;
  key: string;
  label: string;
  icon: string | null;
  color: string | null;
};

export const projectLevelsQuery = (projectId: string | null, kind: "difficulty" | "urgency") =>
  queryOptions({
    queryKey: ["project-levels", kind, projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectLevelRow[]> => {
      // Both tables share the same column shape; cast the dynamic name to one literal.
      const table = (
        kind === "difficulty" ? "project_difficulty_levels" : "project_urgency_levels"
      ) as "project_difficulty_levels";
      const { data, error } = await supabase
        .from(table)
        .select("id, key, label, icon, color")
        .eq("project_id", projectId!)
        .eq("enabled", true)
        .eq("is_archived", false)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ProjectLevelRow[];
    },
  });

/** A custom field definition (enabled) shown on the task form. */
export type ProjectCustomFieldDef = {
  id: string;
  key: string;
  label: string;
  field_type: string; // text | number | date | select | multiselect | boolean
  options: string[];
  required: boolean;
};

export const projectCustomFieldDefsQuery = (projectId: string | null) =>
  queryOptions({
    queryKey: ["project-custom-field-defs", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectCustomFieldDef[]> => {
      const { data, error } = await supabase
        .from("project_custom_field_defs")
        .select("id, key, label, field_type, options, required")
        .eq("project_id", projectId!)
        .eq("enabled", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id,
        key: d.key,
        label: d.label,
        field_type: d.field_type,
        required: d.required,
        options: Array.isArray(d.options) ? (d.options as string[]) : [],
      }));
    },
  });

/** Existing custom-field values for a task (edit-mode prefill). */
export const taskCustomFieldValuesQuery = (taskId: string | undefined) =>
  queryOptions({
    queryKey: ["task-custom-field-values", taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<{ field_def_id: string; value: unknown }[]> => {
      const { data, error } = await supabase
        .from("project_custom_field_values")
        .select("field_def_id, value")
        .eq("task_id", taskId!);
      if (error) throw error;
      return (data ?? []) as { field_def_id: string; value: unknown }[];
    },
  });

export const entityTasksQuery = <T = unknown>(entityId: string) =>
  queryOptions({
    queryKey: ["tasks", entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, slug, title, description, status, priority, due_date, software, tax_year")
        .eq("entity_id", entityId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as T[];
    },
  });

export async function updateEntityTask(id: string, patch: Record<string, unknown>) {
  // Dynamic patch — callers pass validated subsets of the tasks row.
  // Strip empty-string values: they would violate enum columns (status, priority,
  // complexity) which reject "" — e.g. a Select cleared back to its placeholder.
  const safePatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== ""));
  if (Object.keys(safePatch).length === 0) return;

  const { error } = await supabase
    .from("tasks")
    .update(safePatch as any)
    .eq("id", id);
  if (error) throw error;
}

export async function createEntityTaskWithTemplate(input: {
  entityId: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  due_date?: string;
  software?: string;
  sharepoint_url?: string;
  form_template?: string;
  tax_year?: number;
  return_type_id?: string | null;
  assignee_id?: string | null;
  reviewer_id?: string | null;
  checklist_titles?: string[];
  template_label?: string;
}): Promise<{ injected: boolean }> {
  const { data: parent, error } = await supabase
    .from("tasks")
    .insert({
      entity_id: input.entityId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      due_date: input.due_date ?? null,
      software: input.software ?? null,
      sharepoint_url: input.sharepoint_url ?? null,
      template: input.form_template && input.form_template !== "none" ? input.form_template : null,
      tax_year: input.tax_year ?? null,
      return_type_id: input.return_type_id ?? null,
      assignee_id: input.assignee_id ?? null,
      reviewer_id: input.reviewer_id ?? null,
      status: input.status || "draft",
    } as any)
    .select("id")
    .single();
  if (error) throw error;

  if (input.form_template && input.form_template !== "none" && parent) {
    let titles = input.checklist_titles;
    if (!titles) {
      const { data: items, error: e2 } = await supabase
        .from("template_checklist_items")
        .select("title, sort_order")
        .eq("template", input.form_template as never)
        .order("sort_order");
      if (e2) throw e2;
      titles = (items ?? []).map((it) => it.title);
    }
    if (titles.length > 0) {
      const rows = titles.map((title) => ({ task_id: parent.id, title }));
      const { error: e3 } = await supabase.from("task_subtasks").insert(rows);
      if (e3) throw e3;
      await supabase.from("task_audit").insert({
        task_id: parent.id,
        event_type: "template_applied",
        payload: {
          template: input.form_template,
          items_created: titles.length,
          label: input.template_label ?? input.form_template,
        },
      });
      return { injected: true };
    }
  }
  return { injected: false };
}

// ───────── Communication ─────────
export type MsgReadRow = { scope: "firm" | "task"; scope_id: string; last_read_at: string };

export const messageReadsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["msg-reads", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("message_reads")
        .select("scope, scope_id, last_read_at")
        .eq("user_id", userId!);
      return ((data ?? []) as MsgReadRow[]).reduce<Record<string, string>>((acc, r) => {
        acc[`${r.scope}:${r.scope_id}`] = r.last_read_at;
        return acc;
      }, {});
    },
  });

export const communicationProjectNavQuery = () =>
  queryOptions({
    queryKey: ["communication-project-nav"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, firm_id, firms(id, name)")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        firm_id: p.firm_id,
        firm_name: (p as { firms?: { name?: string | null } | null }).firms?.name ?? null,
      }));
    },
  });

export const communicationTaskNavQuery = () =>
  queryOptions({
    queryKey: ["communication-task-nav"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, pipeline_stage, client_entities(project_id, projects(id, name, firm_id, firms(id, name)))",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((t) => {
        const entity = (
          t as {
            client_entities?: {
              project_id?: string | null;
              projects?: {
                id?: string;
                name?: string;
                firm_id?: string;
                firms?: { name?: string | null } | null;
              } | null;
            } | null;
          }
        ).client_entities;
        return {
          id: t.id,
          title: t.title,
          project_id: entity?.project_id ?? entity?.projects?.id ?? null,
          project_name: entity?.projects?.name ?? null,
          firm_id: entity?.projects?.firm_id ?? null,
          firm_name: entity?.projects?.firms?.name ?? null,
          pipeline_stage: (t as { pipeline_stage?: string | null }).pipeline_stage ?? null,
        };
      });
    },
  });

export const inboxFirmMessagesQuery = () =>
  queryOptions({
    queryKey: ["inbox-firm-messages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("firm_messages")
        .select("id, firm_id, author_id, body, is_client_visible, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

export const inboxTaskMessagesQuery = () =>
  queryOptions({
    queryKey: ["inbox-task-messages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_messages")
        .select("id, task_id, author_id, body, is_client_visible, created_at, deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

export const commAuthorsQuery = (authorIds: string[]) =>
  queryOptions({
    queryKey: ["comm-authors", authorIds.join(",")],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", authorIds);
      const map: Record<
        string,
        { full_name: string | null; email: string | null; avatar_url: string | null }
      > = {};
      for (const p of data ?? [])
        map[p.id] = {
          full_name: p.full_name ?? null,
          email: p.email ?? null,
          avatar_url: p.avatar_url ?? null,
        };
      return map;
    },
  });

export async function markScopeRead(input: {
  userId: string;
  scope: "firm" | "task";
  scopeId: string;
}) {
  await supabase.from("message_reads").upsert(
    {
      user_id: input.userId,
      scope: input.scope,
      scope_id: input.scopeId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,scope,scope_id" },
  );
}

export async function sendTaskMessage(input: {
  taskId: string;
  authorId: string;
  body: string;
  isClientVisible: boolean;
  mentionUserIds?: string[];
  firmId?: string | null;
}) {
  const { error } = await supabase.from("task_messages").insert({
    task_id: input.taskId,
    author_id: input.authorId,
    body: input.body,
    is_client_visible: input.isClientVisible,
  });
  if (error) throw error;
  if (input.mentionUserIds?.length) {
    await supabase.from("notifications").insert(
      input.mentionUserIds.map((uid) => ({
        user_id: uid,
        kind: "mention",
        title: "You were mentioned in a task",
        body: input.body.slice(0, 140),
        firm_id: input.firmId ?? null,
        task_id: input.taskId,
        url: `/ops/tasks/${input.taskId}`,
      })),
    );
  }
}

export async function sendFirmMessage(input: {
  firmId: string;
  authorId: string;
  body: string;
  isClientVisible: boolean;
  mentionUserIds?: string[];
}) {
  const { error } = await supabase.from("firm_messages").insert({
    firm_id: input.firmId,
    author_id: input.authorId,
    body: input.body,
    is_client_visible: input.isClientVisible,
  });
  if (error) throw error;
  if (input.mentionUserIds?.length) {
    await supabase.from("notifications").insert(
      input.mentionUserIds.map((uid) => ({
        user_id: uid,
        kind: "mention",
        title: "You were mentioned in firm chat",
        body: input.body.slice(0, 140),
        firm_id: input.firmId,
        url: `/ops/firms/${input.firmId}/communication`,
      })),
    );
  }
}

// =============== Templates mutations ===============
export async function createWorkflowTemplate(input: {
  name: string;
  description: string | null;
  template: string | null;
  category?: TemplateCategory;
  email_subject?: string | null;
  email_body?: string | null;
}) {
  const { data: maxRow } = await supabase
    .from("workflow_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const sort_order = ((maxRow as unknown as { sort_order: number } | null)?.sort_order ?? 0) + 10;
  const slug = `${input.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const row: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    template: input.template,
    slug,
    sort_order,
  };
  // Only set category for non-workflow rows so the existing workflow create
  // path keeps working even before the category column migration is applied.
  if (input.category && input.category !== "workflow") row.category = input.category;
  if (input.category === "email") {
    row.email_subject = input.email_subject ?? null;
    row.email_body = input.email_body ?? null;
  }
  // row is a Record<string,unknown> to support optional category/email fields

  const { error } = await supabase.from("workflow_templates").insert(row as any);
  if (error) throw error;
}

export async function deleteWorkflowTemplate(id: string) {
  await supabase.from("template_checklist_items").delete().eq("workflow_template_id", id);
  const { error } = await supabase.from("workflow_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function updateWorkflowTemplate(input: {
  id: string;
  name: string;
  description: string | null;
  template: string | null;
  email_subject?: string | null;
  email_body?: string | null;
}) {
  const patch: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    template: input.template,
  };
  if (input.email_subject !== undefined) patch.email_subject = input.email_subject;
  if (input.email_body !== undefined) patch.email_body = input.email_body;
  // Dynamic patch — email_subject/email_body are conditionally included

  const { error } = await supabase
    .from("workflow_templates")
    .update(patch as any)
    .eq("id", input.id);
  if (error) throw error;
}

export async function reorderWorkflowTemplates(updates: { id: string; sort_order: number }[]) {
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from("workflow_templates").update({ sort_order }).eq("id", id),
    ),
  );
}

export async function reorderTemplateChecklistItems(updates: { id: string; sort_order: number }[]) {
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from("template_checklist_items").update({ sort_order }).eq("id", id),
    ),
  );
}

/** Persist drag-reordered To-Do task positions within a Firm/Project group. */
export async function reorderTasks(updates: { id: string; sort_order: number }[]) {
  await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase
        .from("tasks")
        .update({ sort_order } as never)
        .eq("id", id),
    ),
  );
}

export async function addTemplateChecklistItem(input: {
  workflow_template_id: string;
  title: string;
  sort_order: number;
  template: string | null;
  description?: string | null;
  /** Action-item kind for clarification templates; omit for workflow items. */
  kind?: string | null;
}) {
  const { error } = await supabase.from("template_checklist_items").insert(input as never);
  if (error) throw error;
}

export async function updateTemplateChecklistItem(input: {
  id: string;
  title: string;
  description?: string | null;
  kind?: string | null;
}) {
  const patch: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? null,
  };
  if (input.kind !== undefined) patch.kind = input.kind;
  // Dynamic patch — kind is conditionally included

  const { error } = await supabase
    .from("template_checklist_items")
    .update(patch as any)
    .eq("id", input.id);
  if (error) throw error;
}

export async function deleteTemplateChecklistItem(id: string) {
  const { error } = await supabase.from("template_checklist_items").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateWorkflowTemplate(
  sourceId: string,
  newName: string,
): Promise<string> {
  const { data: src, error: e0 } = await supabase
    .from("workflow_templates")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (e0 || !src) throw e0 ?? new Error("Source template not found");

  const { data: maxRow } = await supabase
    .from("workflow_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const sort_order = ((maxRow as unknown as { sort_order: number } | null)?.sort_order ?? 0) + 10;

  const source = src as unknown as WorkflowTemplate;
  const slug = `${newName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const row: Record<string, unknown> = {
    name: newName,
    description: source.description,
    template: null,
    slug,
    sort_order,
  };
  const srcCategory = (source.category ?? "workflow") as TemplateCategory;
  if (srcCategory !== "workflow") row.category = srcCategory;
  if (srcCategory === "email") {
    row.email_subject = source.email_subject ?? null;
    row.email_body = source.email_body ?? null;
  }
  // row is dynamic Record to support optional category/email_subject/email_body

  const { data: newTpl, error: e1 } = await supabase
    .from("workflow_templates")
    .insert(row as any)
    .select("id")
    .single();
  if (e1 || !newTpl) throw e1 ?? new Error("Failed to create duplicate");
  const { data: itemsRaw } = await supabase
    .from("template_checklist_items")
    .select("title, description, sort_order, template, kind")
    .eq("workflow_template_id", sourceId)
    .order("sort_order");
  const items = (itemsRaw ?? []) as unknown as Array<{
    title: string;
    description: string | null;
    sort_order: number;
    template: string | null;
    kind: string | null;
  }>;
  if (items.length > 0) {
    await supabase
      .from("template_checklist_items")
      .insert(
        items.map((i) => ({ workflow_template_id: (newTpl as { id: string }).id, ...i })) as never,
      );
  }
  return (newTpl as { id: string }).id;
}

// =============== Clarification → Action Items generation ===============
/**
 * Materialize a clarification template's items into a task's
 * "Clarifications & Action Items" section (task_action_items). Dedupes against
 * the task's existing items by stripped text, mirroring subtask-list's
 * "Add from workflow". Returns the number of new items created.
 */
export async function generateActionItemsFromTemplate(input: {
  templateId: string;
  taskId: string;
  createdBy: string | null;
  templateName?: string;
}): Promise<number> {
  const [{ data: items, error: itemsErr }, { data: existing }] = await Promise.all([
    supabase
      .from("template_checklist_items")
      .select("title, description, kind, sort_order")
      .eq("workflow_template_id", input.templateId)
      .order("sort_order"),
    supabase
      .from("task_action_items")
      .select("title")
      .eq("task_id", input.taskId)
      .is("deleted_at", null),
  ]);
  if (itemsErr) throw itemsErr;

  const strip = (html: string) =>
    html
      .replace(/<[^>]*>/g, "")
      .trim()
      .toLowerCase();
  const seen = new Set(((existing ?? []) as { title: string }[]).map((r) => strip(r.title)));

  type SrcItem = { title: string; description: string | null; kind: string | null };
  const fresh = ((items ?? []) as unknown as SrcItem[]).filter((it) => {
    const text = strip(it.title);
    return text.length > 0 && !seen.has(text);
  });
  if (fresh.length === 0) return 0;

  const rows = fresh.map((it) => ({
    task_id: input.taskId,
    title: it.title,
    kind: it.kind ?? "clarification",
    created_by: input.createdBy,
  }));
  const { error: insErr } = await supabase.from("task_action_items").insert(rows);
  if (insErr) throw insErr;

  await supabase.from("task_audit").insert({
    task_id: input.taskId,
    event_type: "clarification_template_applied",
    payload: {
      template_id: input.templateId,
      template: input.templateName ?? null,
      items_created: fresh.length,
    },
  });
  return fresh.length;
}

/** Insert a user-selected subset of template_checklist_items into a task as action items. */
export async function addSelectedTemplateItemsToTask(input: {
  taskId: string;
  itemIds: string[];
  createdBy: string | null;
  templateId?: string;
  templateName?: string;
}): Promise<number> {
  if (input.itemIds.length === 0) return 0;

  const [{ data: items, error: itemsErr }, { data: existing }] = await Promise.all([
    supabase
      .from("template_checklist_items")
      .select("id, title, kind, sort_order, workflow_template_id")
      .in("id", input.itemIds)
      .order("sort_order"),
    supabase
      .from("task_action_items")
      .select("title")
      .eq("task_id", input.taskId)
      .is("deleted_at", null),
  ]);
  if (itemsErr) throw itemsErr;

  const strip = (html: string) =>
    html
      .replace(/<[^>]*>/g, "")
      .trim()
      .toLowerCase();
  const seen = new Set(((existing ?? []) as { title: string }[]).map((r) => strip(r.title)));

  type SrcItem = { id: string; title: string; kind: string | null };
  const fresh = ((items ?? []) as unknown as SrcItem[]).filter((it) => {
    const text = strip(it.title);
    return text.length > 0 && !seen.has(text);
  });
  if (fresh.length === 0) return 0;

  const rows = fresh.map((it) => ({
    task_id: input.taskId,
    title: it.title,
    kind: it.kind ?? "clarification",
    created_by: input.createdBy,
  }));
  const { error: insErr } = await supabase.from("task_action_items").insert(rows);
  if (insErr) throw insErr;

  if (input.templateId) {
    await supabase.from("task_audit").insert({
      task_id: input.taskId,
      event_type: "clarification_template_applied",
      payload: {
        template_id: input.templateId,
        template: input.templateName ?? null,
        items_created: fresh.length,
        selected: true,
      },
    });
  }
  return fresh.length;
}

/** Lightweight task list for the "Generate Action Items" target picker. */
export type TemplateTaskOption = {
  id: string;
  title: string;
  firm_name: string | null;
  project_name: string | null;
};
export const templateTaskPickerQuery = () =>
  queryOptions({
    queryKey: ["template-task-picker"],
    queryFn: async (): Promise<TemplateTaskOption[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, client_entities(projects(name, firms(name)))")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      type Raw = {
        id: string;
        title: string;
        client_entities: {
          projects: { name: string | null; firms: { name: string | null } | null } | null;
        } | null;
      };
      return ((data ?? []) as unknown as Raw[]).map((t) => ({
        id: t.id,
        title: t.title,
        project_name: t.client_entities?.projects?.name ?? null,
        firm_name: t.client_entities?.projects?.firms?.name ?? null,
      }));
    },
  });

// =============== Firm timesheet ===============
export type FirmTimesheetLogRow = {
  id: string;
  user_id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  break_minutes: number;
  effective_minutes: number | null;
  effective_override: number | null;
  timer_group_size: number;
  note: string | null;
  tasks: {
    id: string;
    title: string;
    client_entities: {
      name: string;
      project_id: string;
      projects: { id: string; name: string; firm_id: string };
    } | null;
  } | null;
};

export const firmTimesheetLogsQuery = (firmId: string, from: string, to: string) =>
  queryOptions({
    queryKey: ["firm-timesheet", firmId, from, to],
    queryFn: async (): Promise<FirmTimesheetLogRow[]> => {
      const { data, error } = await supabase
        .from("time_logs")
        .select(
          `
          id, user_id, task_id, started_at, ended_at, duration_minutes, break_minutes, effective_minutes, effective_override, timer_group_size, note,
          tasks!inner(id, title, client_entities!inner(name, project_id, projects!inner(id, name, firm_id)))
        `,
        )
        .eq("tasks.client_entities.projects.firm_id", firmId)
        .gte("started_at", from + "T00:00:00")
        .lte("started_at", to + "T23:59:59")
        .order("started_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as FirmTimesheetLogRow[];
    },
  });

// B2C variant — joins via tasks.direct_client_id instead of firm hierarchy
export type DirectClientTimesheetLogRow = {
  id: string;
  user_id: string;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  break_minutes: number | null;
  effective_minutes: number | null;
  effective_override: number | null;
  timer_group_size: number;
  note: string | null;
  tasks: {
    id: string;
    title: string;
    direct_client_id: string | null;
    direct_clients: { display_name: string } | null;
  } | null;
};

export const directClientTimesheetLogsQuery = (directClientId: string, from: string, to: string) =>
  queryOptions({
    queryKey: ["direct-client-timesheet", directClientId, from, to],
    queryFn: async (): Promise<DirectClientTimesheetLogRow[]> => {
      const { data, error } = await supabase
        .from("time_logs")
        .select(
          `id, user_id, task_id, started_at, ended_at, duration_minutes, break_minutes, effective_minutes, effective_override, timer_group_size, note,
          tasks!inner(id, title, direct_client_id, direct_clients(display_name))`,
        )
        .eq("tasks.direct_client_id", directClientId)
        .gte("started_at", from + "T00:00:00")
        .lte("started_at", to + "T23:59:59")
        .order("started_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as DirectClientTimesheetLogRow[];
    },
  });

export type ProfileLite = { id: string; full_name: string | null; email: string | null };

export const profilesByIdsQuery = (userIds: string[]) =>
  queryOptions({
    queryKey: ["profiles-by-ids", [...userIds].sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<Record<string, ProfileLite>> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      return Object.fromEntries(((data ?? []) as ProfileLite[]).map((p) => [p.id, p]));
    },
  });

// =============== Firm clients ===============
export type FirmClientRow = {
  id: string;
  firm_id: string;
  name: string;
  kind: "client" | "group";
  parent_id: string | null;
  notes: string | null;
  is_archived: boolean;
};

export type FirmClientTaskRow = {
  id: string;
  title: string;
  status: string;
  pipeline_stage: string;
  client_id: string | null;
  client_entities: {
    project_id: string;
    projects: { id: string; name: string; code: string | null } | null;
  } | null;
};

export const firmClientsQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["firm-clients", firmId],
    queryFn: async (): Promise<FirmClientRow[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, firm_id, name, kind, parent_id, notes, is_archived")
        .eq("firm_id", firmId)
        .eq("is_archived" as any, false)
        .order("kind", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as FirmClientRow[];
    },
  });

export const firmClientTasksQuery = (firmId: string, clientId: string | null) =>
  queryOptions({
    queryKey: ["firm-clients-tasks", firmId, clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<FirmClientTaskRow[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, status, pipeline_stage, client_id, client_entities(project_id, projects(id, name, code))",
        )
        .eq("client_id", clientId!);
      if (error) throw error;
      return (data ?? []) as unknown as FirmClientTaskRow[];
    },
  });

export const firmGroupTasksQuery = (groupId: string | null, childIds: string[]) =>
  queryOptions({
    queryKey: ["firm-group-tasks", groupId, childIds],
    enabled: !!groupId && childIds.length > 0,
    queryFn: async (): Promise<FirmClientTaskRow[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, status, pipeline_stage, client_id, client_entities(project_id, projects(id, name, code))",
        )
        .in("client_id", childIds);
      if (error) throw error;
      return (data ?? []) as unknown as FirmClientTaskRow[];
    },
  });

export async function createFirmClient(input: {
  firmId: string;
  name: string;
  kind: "client" | "group";
  parentId: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      firm_id: input.firmId,
      name: input.name,
      kind: input.kind,
      parent_id: input.parentId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function createFirmClientGroupReturningId(input: {
  firmId: string;
  name: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from("clients")
    .insert({ firm_id: input.firmId, name: input.name, kind: "group" })
    .select("id")
    .single();
  if (error) throw error;
  return (data?.id ?? null) as string | null;
}

export async function updateFirmClient(input: {
  id: string;
  name: string;
  notes: string | null;
  parentId: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({ name: input.name, notes: input.notes, parent_id: input.parentId })
    .eq("id", input.id);
  if (error) throw error;
}

export async function deleteFirmClient(id: string) {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

export async function archiveFirmClient(id: string): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({ is_archived: true } as any)
    .eq("id", id);
  if (error) throw error;
}

export async function reassignTaskClient(input: { taskId: string; clientId: string | null }) {
  const { error } = await supabase
    .from("tasks")
    .update({ client_id: input.clientId })
    .eq("id", input.taskId);
  if (error) throw error;
}

// =============== Firm contacts + internal team (client-info page) ===============
export type FirmContactRow = {
  id: string;
  full_name: string;
  role_title: string | null;
  email: string | null;
  phone: string | null;
};

export const firmContactsQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["firm-contacts", firmId],
    queryFn: async (): Promise<FirmContactRow[]> => {
      const { data, error } = await supabase
        .from("firm_contacts")
        .select("id, full_name, role_title, email, phone")
        .eq("firm_id", firmId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as FirmContactRow[];
    },
  });

export async function createFirmContact(input: {
  firmId: string;
  full_name: string;
  role_title: string | null;
  email: string | null;
  phone: string | null;
}) {
  const { error } = await supabase.from("firm_contacts").insert({
    firm_id: input.firmId,
    full_name: input.full_name,
    role_title: input.role_title,
    email: input.email,
    phone: input.phone,
  });
  if (error) throw error;
}

export async function deleteFirmContact(id: string) {
  const { error } = await supabase.from("firm_contacts").delete().eq("id", id);
  if (error) throw error;
}

export type FirmInternalTeamRow = {
  id: string;
  user_id: string;
  role_label: string | null;
};

export const firmInternalTeamQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["firm-internal-team", firmId],
    queryFn: async (): Promise<FirmInternalTeamRow[]> => {
      const { data, error } = await supabase
        .from("firm_internal_team")
        .select("id, user_id, role_label")
        .eq("firm_id", firmId);
      if (error) throw error;
      return (data ?? []) as FirmInternalTeamRow[];
    },
  });

export const firmInternalTeamProfilesQuery = (userIds: string[]) =>
  queryOptions({
    queryKey: ["firm-internal-team-profiles", [...userIds].sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      return (data ?? []) as ProfileLite[];
    },
  });

export const internalEligibleProfilesQuery = () =>
  queryOptions({
    queryKey: ["internal-eligible-profiles"],
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "employee"]);
      const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (data ?? []) as ProfileLite[];
    },
  });

export async function addFirmInternalTeamMember(input: {
  firmId: string;
  userId: string;
  roleLabel: string | null;
}) {
  const { error } = await supabase
    .from("firm_internal_team")
    .insert({ firm_id: input.firmId, user_id: input.userId, role_label: input.roleLabel });
  if (error) throw error;
}

export async function removeFirmInternalTeamMember(id: string) {
  const { error } = await supabase.from("firm_internal_team").delete().eq("id", id);
  if (error) throw error;
}

// =============== Firm info (client-info page) ===============
export type FirmInfoRow = {
  id: string;
  name: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  us_timezone: string | null;
  accounting_software: string[] | null;
  tax_software: string[] | null;
  pm_software: string[] | null;
};

export const firmInfoQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["firm-info", firmId],
    queryFn: async (): Promise<FirmInfoRow> => {
      const { data, error } = await supabase
        .from("firms")
        .select(
          "id, name, address, contact_email, contact_phone, notes, us_timezone, accounting_software, tax_software, pm_software",
        )
        .eq("id", firmId)
        .single();
      if (error) throw error;
      return data as FirmInfoRow;
    },
  });

export async function updateFirmInfo(input: {
  firmId: string;
  address: string | null;
  us_timezone: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  accounting_software: string[];
  tax_software: string[];
  pm_software: string[];
}) {
  const { error } = await supabase
    .from("firms")
    .update({
      address: input.address,
      us_timezone: input.us_timezone,
      contact_email: input.contact_email,
      contact_phone: input.contact_phone,
      notes: input.notes,
      accounting_software: input.accounting_software,
      tax_software: input.tax_software,
      pm_software: input.pm_software,
    })
    .eq("id", input.firmId);
  if (error) throw error;
}

// =============== Unified work-item creation ===============
export type WorkItemPeriod = "Monthly" | "Quarterly" | "Yearly" | "Ad-hoc";
export type WorkItemComplexity = "a_hard" | "b_medium" | "c_easy";

export async function createWorkItem(input: {
  projectId: string;
  /** Firm-level client id chosen in the picker. */
  clientId: string;
  title: string;
  priority: string;
  period: WorkItemPeriod | null;
  taxYear: number | null;
  complexity: WorkItemComplexity;
  startDate: string; // ISO timestamptz
  dueDate: string; // ISO timestamptz
  assigneeIds: string[];
  reviewerIds: string[];
  returnTypeId?: string | null;
  /** Initial status — defaults to "draft" when omitted (e.g. project default_status). */
  status?: string | null;
  /** Project-configured difficulty/urgency level ids. */
  difficultyLevelId?: string | null;
  urgencyLevelId?: string | null;
  /** Custom-field values keyed by field definition id. Empty values are skipped. */
  customFieldValues?: { fieldDefId: string; value: unknown }[];
}): Promise<{ taskId: string }> {
  // 1. Resolve / create the project-scoped entity that mirrors the firm client.
  const { data: entityIdData, error: entityErr } = await supabase.rpc(
    "ensure_entity_for_firm_client",
    { _project_id: input.projectId, _client_id: input.clientId },
  );
  if (entityErr) throw entityErr;
  const entityId = entityIdData as unknown as string;
  if (!entityId) throw new Error("Could not resolve entity for the selected client.");

  // 2. Insert the task. Mirror first assignee/reviewer for back-compat reads.
  const { data: parent, error } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      entity_id: entityId,
      client_id: input.clientId,
      title: input.title,
      priority: input.priority,
      period: input.period,
      tax_year: input.taxYear,
      complexity: input.complexity,
      difficulty_level_id: input.difficultyLevelId ?? null,
      urgency_level_id: input.urgencyLevelId ?? null,
      start_date: input.startDate,
      due_date: input.dueDate,
      return_type_id: input.returnTypeId ?? null,
      assignee_id: input.assigneeIds[0] ?? null,
      reviewer_id: input.reviewerIds[0] ?? null,
      status: input.status || "draft",
    } as any)
    .select("id")
    .single();
  if (error) throw error;
  const taskId = (parent as { id: string }).id;

  // 3. Write all assignees / reviewers into the join table.
  const joinRows = [
    ...input.assigneeIds.map((user_id) => ({ task_id: taskId, user_id, role: "assignee" })),
    ...input.reviewerIds.map((user_id) => ({ task_id: taskId, user_id, role: "reviewer" })),
  ];
  if (joinRows.length > 0) {
    const { error: jErr } = await supabase
      .from("task_assignees")
      .upsert(joinRows, { onConflict: "task_id,user_id,role" });
    if (jErr) throw jErr;
  }

  // 4. Persist any custom-field values configured on the project.
  if (input.customFieldValues && input.customFieldValues.length > 0) {
    await writeTaskCustomFieldValues(taskId, input.customFieldValues, false);
  }

  return { taskId };
}

export async function createDirectClientTask(input: {
  directClientId: string;
  taskTypeId: string;
  title: string;
  priority?: string;
  complexity?: WorkItemComplexity;
  startDate?: string;
  dueDate?: string;
  assigneeIds?: string[];
  reviewerIds?: string[];
}): Promise<{ taskId: string }> {
  const assigneeIds = input.assigneeIds ?? [];
  const reviewerIds = input.reviewerIds ?? [];

  const { data: parent, error } = await supabase
    .from("tasks")
    .insert({
      direct_client_id: input.directClientId,
      task_type_id: input.taskTypeId,
      title: input.title,
      priority: input.priority ?? "medium",
      complexity: input.complexity ?? "b_medium",
      start_date: input.startDate ?? null,
      due_date: input.dueDate ?? null,
      assignee_id: assigneeIds[0] ?? null,
      reviewer_id: reviewerIds[0] ?? null,
      stream: "direct",
      status: "draft",
    } as any)
    .select("id")
    .single();
  if (error) throw error;
  const taskId = (parent as { id: string }).id;

  const joinRows = [
    ...assigneeIds.map((user_id) => ({ task_id: taskId, user_id, role: "assignee" })),
    ...reviewerIds.map((user_id) => ({ task_id: taskId, user_id, role: "reviewer" })),
  ];
  if (joinRows.length > 0) {
    const { error: jErr } = await supabase
      .from("task_assignees")
      .upsert(joinRows, { onConflict: "task_id,user_id,role" });
    if (jErr) throw jErr;
  }

  return { taskId };
}

// ─────────────── My Day (personal pin, MS To-Do style) ───────────────
export type MyDayRow = {
  id: string;
  task_id: string;
  user_id: string;
  day: string;
  added_at: string;
  removed_at: string | null;
  tasks: {
    id: string;
    display_id: string | null;
    title: string;
    due_date: string | null;
    start_date: string | null;
    client_entities: {
      name: string | null;
      projects: { id: string; name: string; firms: { id: string; name: string } | null } | null;
    } | null;
  } | null;
};

export const myDayActiveQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["my-day", userId, "active"],
    enabled: !!userId,
    queryFn: async (): Promise<MyDayRow[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("task_my_day")
        .select(
          "id, task_id, user_id, day, added_at, removed_at, tasks(id, display_id, title, due_date, start_date, client_entities(name, projects(id, name, firms(id, name))))",
        )
        .eq("user_id", userId!)
        .eq("day", today)
        .is("removed_at", null)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyDayRow[];
    },
  });

export const myDayHistoryQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["my-day", userId, "history"],
    enabled: !!userId,
    queryFn: async (): Promise<MyDayRow[]> => {
      const { data, error } = await supabase
        .from("task_my_day")
        .select(
          "id, task_id, user_id, day, added_at, removed_at, tasks(id, display_id, title, due_date, start_date, client_entities(name, projects(id, name, firms(id, name))))",
        )
        .eq("user_id", userId!)
        .order("day", { ascending: false })
        .order("added_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as MyDayRow[];
    },
  });

export const isInMyDayQuery = (taskId: string | undefined, userId: string | undefined) =>
  queryOptions({
    queryKey: ["my-day-task", taskId, userId],
    enabled: !!taskId && !!userId,
    queryFn: async (): Promise<boolean> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("task_my_day")
        .select("id")
        .eq("task_id", taskId!)
        .eq("user_id", userId!)
        .eq("day", today)
        .is("removed_at", null)
        .maybeSingle();
      return !!data;
    },
  });

export async function addToMyDay(taskId: string, userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("task_my_day")
    .insert({ task_id: taskId, user_id: userId, day: today });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
}

export async function removeFromMyDay(taskId: string, userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("task_my_day")
    .update({ removed_at: new Date().toISOString() })
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .eq("day", today)
    .is("removed_at", null);
  if (error) throw error;
}

// ─────────────── Subtasks (for inline expand on To-Do table) ───────────────
export type TaskSubtaskRow = {
  id: string;
  task_id: string;
  title: string;
  status: string;
  is_done: boolean;
  assignee_id: string | null;
  due_date: string | null;
  sort_order: number;
};

export const subtasksByTaskQuery = (taskId: string | undefined) =>
  queryOptions({
    queryKey: ["task-subtasks", taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskSubtaskRow[]> => {
      const { data, error } = await supabase
        .from("task_subtasks")
        .select("id, task_id, title, status, is_done, assignee_id, due_date, sort_order")
        .eq("task_id", taskId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TaskSubtaskRow[];
    },
  });

// ============================================================================
// Keyset-paginated infinite queries for high-volume tables.
//
// At 5M+ rows we cannot fetch the whole table — these queries pull one
// PAGE_SIZE-row slice at a time, ordered DESC on `(created_at, id)` or
// `(started_at, id)`. The matching composite index lives in the
// `scale_ops_grids_indexes` migration.
//
// Date-range filters are pushed to the server (high selectivity at 5M rows).
// Other narrow filters (firm/project/event) are applied client-side over the
// pages already loaded — acceptable because the date-range scope narrows the
// working set into the low thousands.
// ============================================================================

export type ActivityFilters = {
  /** Restrict to events authored by this actor (server-side). */
  actorId?: string | null;
  /** Restrict to a single event_type (server-side). */
  eventType?: string | null;
  /** Restrict to events created on/after this ISO date (server-side). */
  fromIso?: string | null;
  /** Restrict to events created on/before end-of-day for this ISO date. */
  toIso?: string | null;
};

export type ActivityPage = {
  rows: AuditRow[];
  nextCursor: Cursor;
};

export const activityFeedInfinite = (filters: ActivityFilters = {}) =>
  infiniteQueryOptions<
    ActivityPage,
    Error,
    { pages: ActivityPage[]; pageParams: unknown[] },
    readonly unknown[],
    Cursor
  >({
    queryKey: ["activity-feed-infinite", filters] as const,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("task_audit")
        .select("id, task_id, actor_id, event_type, payload, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (filters.actorId) q = q.eq("actor_id", filters.actorId);
      if (filters.eventType) q = q.eq("event_type", filters.eventType);
      if (filters.fromIso) q = q.gte("created_at", filters.fromIso);
      if (filters.toIso) {
        const end = new Date(filters.toIso);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      q = applyKeysetDesc(q, "created_at", "id", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as AuditRow[];
      return {
        rows,
        nextCursor: hasMore(rows, PAGE_SIZE) ? nextCursorFrom(rows, "created_at") : null,
      };
    },
    getNextPageParam: (last) => last.nextCursor,
    // Cap the in-memory window so even endless scroll never balloons.
    maxPages: 25, // ~5,000 rows in cache
    staleTime: 30_000,
  });

export type TimeLogsFilters = {
  /** Required when role === "employee". Server-side scope. */
  userId?: string | null;
  /** Optional project filter (server-side). */
  projectId?: string | null;
  /** Optional date window on started_at (server-side). */
  fromIso?: string | null;
  toIso?: string | null;
};

type TimeLogPageRow = {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  note: string | null;
  user_id: string;
  billable: boolean;
  break_minutes: number;
  effective_minutes: number | null;
  effective_override: number | null;
  timer_group_size: number;
  tasks: unknown;
};

export type TimeLogsPage = { rows: TimeLogPageRow[]; nextCursor: Cursor };

export const timeLogsInfinite = (filters: TimeLogsFilters = {}) =>
  infiniteQueryOptions<
    TimeLogsPage,
    Error,
    { pages: TimeLogsPage[]; pageParams: unknown[] },
    readonly unknown[],
    Cursor
  >({
    queryKey: ["time-logs-infinite", filters] as const,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("time_logs")
        .select(
          "id, task_id, started_at, ended_at, duration_minutes, note, user_id, billable, break_minutes, effective_minutes, effective_override, timer_group_size, tasks(title, entity_id, client_entities(project_id, projects(id, name, code, firm_id, firms(id, name, firm_identifier))))",
        )
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (filters.userId) q = q.eq("user_id", filters.userId);
      if (filters.projectId) q = q.eq("tasks.client_entities.project_id", filters.projectId);
      if (filters.fromIso) q = q.gte("started_at", filters.fromIso);
      if (filters.toIso) {
        const end = new Date(filters.toIso);
        end.setHours(23, 59, 59, 999);
        q = q.lte("started_at", end.toISOString());
      }
      q = applyKeysetDesc(q, "started_at", "id", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as TimeLogPageRow[];
      return {
        rows,
        nextCursor: hasMore(rows, PAGE_SIZE) ? nextCursorFrom(rows, "started_at") : null,
      };
    },
    getNextPageParam: (last) => last.nextCursor,
    maxPages: 25,
    staleTime: 30_000,
  });

export type NotificationsPage = { rows: NotificationRow[]; nextCursor: Cursor };

/**
 * Keyset-paginated inbox. Pins are surfaced via a separate first-page bias
 * (handled by the caller: it can render pinned rows pulled out of the first
 * page on top). Pagination ordering stays plain `(created_at DESC, id DESC)`
 * so the cursor math stays correct.
 */
export const notificationsInboxInfinite = (userId: string) =>
  infiniteQueryOptions<
    NotificationsPage,
    Error,
    { pages: NotificationsPage[]; pageParams: unknown[] },
    readonly unknown[],
    Cursor
  >({
    queryKey: ["notifications-inbox-infinite", userId] as const,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("notifications")
        .select(
          "id, kind, title, body, url, task_id, project_id, firm_id, read_at, is_pinned, created_at, firms(id, name, firm_identifier), projects(id, name, code)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      q = applyKeysetDesc(q, "created_at", "id", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as NotificationRow[];
      return {
        rows,
        nextCursor: hasMore(rows, PAGE_SIZE) ? nextCursorFrom(rows, "created_at") : null,
      };
    },
    getNextPageParam: (last) => last.nextCursor,
    maxPages: 25,
    staleTime: 15_000,
  });

/** Approximate row count for footer chips ("~12,453 results"). */
export async function tableRowEstimate(
  table: "task_audit" | "time_logs" | "notifications",
): Promise<number> {
  // RPC not yet in generated types — cast required until types are regenerated.

  const { data, error } = await supabase.rpc("table_row_estimate" as any, { p_table: table });
  if (error) return 0;
  return Number(data ?? 0);
}

// ───────── Workload ─────────

export type WorkloadProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  department: string | null;
  position_title: string | null;
  weekly_capacity_hours: number;
};

export type WorkloadTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
  task_assignees: { user_id: string; role: string }[] | null;
};

export type WorkloadTimeLog = {
  user_id: string;
  duration_minutes: number | null;
  started_at: string;
};

export type WorkloadData = {
  profiles: WorkloadProfile[];
  tasks: WorkloadTask[];
  weekLogs: WorkloadTimeLog[];
};

export const workloadQuery = () =>
  queryOptions({
    queryKey: ["workload"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<WorkloadData> => {
      const now = new Date();
      const dow = now.getDay() === 0 ? 7 : now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dow - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const [profilesRes, tasksRes, logsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, full_name, email, avatar_url, department, position_title, weekly_capacity_hours",
          )
          .order("full_name", { ascending: true }),
        supabase
          .from("tasks")
          .select(
            "id, title, status, priority, due_date, assignee_id, task_assignees(user_id, role)",
          )
          .neq("status", "complete")
          .order("due_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("time_logs")
          .select("user_id, duration_minutes, started_at")
          .gte("started_at", monday.toISOString())
          .lte("started_at", sunday.toISOString())
          .not("duration_minutes", "is", null),
      ]);

      return {
        profiles: (profilesRes.data ?? []) as unknown as WorkloadProfile[],
        tasks: (tasksRes.data ?? []) as unknown as WorkloadTask[],
        weekLogs: (logsRes.data ?? []) as unknown as WorkloadTimeLog[],
      };
    },
  });

// ─── Task header / info queries (used by the To-Do split-pane) ─────

export type TaskHeaderRow = {
  id: string;
  display_id: string | null;
  title: string;
  stream: string;
  isDirect: boolean;
  firm: string;
  firmCode: string | null;
  project: string | null;
  projectCode: string | null;
  client: string | null;
};

export const taskHeaderQuery = (taskId: string) =>
  queryOptions({
    queryKey: ["task-header", taskId],
    staleTime: 30_000,
    queryFn: async (): Promise<TaskHeaderRow> => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, display_id, title, stream, client_entities(name, projects(name, code, firms(name, firm_identifier))), direct_clients(display_name, client_code)",
        )
        .eq("id", taskId)
        .single();
      if (error) throw error;
      const isDirect = (data.stream as string) === "direct";
      const entity = data.client_entities as {
        name?: string | null;
        projects?: {
          name?: string | null;
          code?: string | null;
          firms?: { name?: string | null; firm_identifier?: string | null } | null;
        } | null;
      } | null;
      const dc = data.direct_clients as {
        display_name?: string | null;
        client_code?: string | null;
      } | null;
      return {
        id: data.id as string,
        display_id: (data.display_id as string | null) ?? null,
        title: data.title as string,
        stream: data.stream as string,
        isDirect,
        firm: isDirect ? (dc?.display_name ?? "—") : (entity?.projects?.firms?.name ?? "—"),
        firmCode: isDirect
          ? (dc?.client_code ?? null)
          : (entity?.projects?.firms?.firm_identifier ?? null),
        project: isDirect ? null : (entity?.projects?.name ?? "—"),
        projectCode: isDirect ? null : (entity?.projects?.code ?? null),
        client: isDirect ? null : (entity?.name ?? ""),
      };
    },
  });

export type TaskInfoRow = {
  id: string;
  display_id: string | null;
  title: string;
  priority: string;
  complexity: string;
  period: string | null;
  tax_year: number | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  pipeline_stage_id: string | null;
  project_id: string | null;
  entity_id: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  client_entities: {
    id: string;
    name: string | null;
    client_id: string | null;
    projects: {
      id: string;
      name: string | null;
      code: string | null;
      firm_id: string | null;
      firms: { id: string; name: string | null; firm_identifier: string | null } | null;
    } | null;
  } | null;
  task_assignees: { user_id: string; role: string }[] | null;
};

export const taskInfoQuery = (taskId: string) =>
  queryOptions({
    queryKey: ["task-info", taskId],
    staleTime: 30_000,
    queryFn: async (): Promise<TaskInfoRow> => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, display_id, title, priority, complexity, period, tax_year, start_date, due_date, completed_at, pipeline_stage_id, project_id, entity_id, assignee_id, reviewer_id, client_entities(id, name, client_id, projects(id, name, code, firm_id, firms(id, name, firm_identifier))), task_assignees(user_id, role)",
        )
        .eq("id", taskId)
        .single();
      if (error) throw error;
      return data as unknown as TaskInfoRow;
    },
  });

// ─── Bulk task creation (server function) ──────────────────────────
export { bulkCreateTasks } from "@/lib/ops/bulk-tasks.functions";
