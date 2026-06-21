import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { projectLevelsQuery } from "@/lib/queries/ops.queries";

/**
 * Shared controller for the task meta fields.
 *
 * Owns the task query + the generic field-update and assignee mutations used by
 * the Global Dashboard "Details" tab. It reads under its own `["task-meta", id]`
 * key (a narrower projection than the full Task View route) and, on every write,
 * also invalidates the route's `["task", id]` cache so the full task page stays
 * fresh.
 */
const TASK_META_PROJECTION =
  "id, title, status, difficulty_level_id, urgency_level_id, due_date, start_date, completed_at, period, software, tax_year, entity_id, client_id, assignee_id, reviewer_id, pipeline_stage, pipeline_stage_id, client_entities(id, name, project_id, projects(id, name, firm_id, firms(id, name)))";

export interface TaskMeta {
  id: string;
  status: string | null;
  difficulty_level_id: string | null;
  urgency_level_id: string | null;
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
  period: string | null;
  software: string | null;
  tax_year: number | null;
  client_id: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  pipeline_stage: string | null;
  pipeline_stage_id: string | null;
  client_entities: {
    id: string;
    name: string | null;
    project_id: string | null;
    projects: {
      id: string;
      name: string;
      firm_id: string | null;
      firms: { id: string; name: string } | null;
    } | null;
  } | null;
}

export function useTaskMeta(taskId: string) {
  const qc = useQueryClient();

  const taskQuery = useQuery({
    queryKey: ["task-meta", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(TASK_META_PROJECTION)
        .eq("id", taskId)
        .single();
      if (error) throw error;
      return data as unknown as TaskMeta;
    },
  });
  const task = taskQuery.data;

  const projectId = task?.client_entities?.project_id ?? null;
  const firmId = task?.client_entities?.projects?.firm_id ?? null;

  const { data: projectStages = [] } = useQuery({
    queryKey: ["project-pipeline-stages", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_pipeline_stages")
        .select("id, key, label, sort_order")
        .eq("project_id", projectId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as { id: string; key: string; label: string; sort_order: number }[];
    },
  });

  const { data: difficultyLevels = [] } = useQuery({
    ...projectLevelsQuery(projectId, "difficulty"),
    enabled: !!projectId,
  });
  const { data: urgencyLevels = [] } = useQuery({
    ...projectLevelsQuery(projectId, "urgency"),
    enabled: !!projectId,
  });

  const { data: assigneeRows } = useQuery({
    queryKey: ["task-assignees", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_assignees")
        .select("user_id, role")
        .eq("task_id", taskId);
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: "assignee" | "reviewer" }[];
    },
  });

  const assigneeIds = useMemo(() => {
    const ids = new Set<string>(
      (assigneeRows ?? []).filter((r) => r.role === "assignee").map((r) => r.user_id),
    );
    if (task?.assignee_id) ids.add(task.assignee_id);
    return Array.from(ids);
  }, [assigneeRows, task]);

  const reviewerIds = useMemo(() => {
    const ids = new Set<string>(
      (assigneeRows ?? []).filter((r) => r.role === "reviewer").map((r) => r.user_id),
    );
    if (task?.reviewer_id) ids.add(task.reviewer_id);
    return Array.from(ids);
  }, [assigneeRows, task]);

  // Generic optimistic field updater for plain task columns (dates, period,
  // pipeline stage, client, difficulty/urgency, tax year). Mirrors the Task View
  // route's `updateField` — empty strings are stripped to avoid enum violations.
  const updateField = useMutation({
    mutationFn: async (rawPatch: Record<string, unknown>) => {
      const patch = Object.fromEntries(Object.entries(rawPatch).filter(([, v]) => v !== ""));
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase
        .from("tasks")
        .update(patch as never)
        .eq("id", taskId);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["task-meta", taskId] });
      const previous = qc.getQueryData<Record<string, unknown>>(["task-meta", taskId]);
      if (previous) qc.setQueryData(["task-meta", taskId], { ...previous, ...patch });
      return { previous };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(["task-meta", taskId], ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["task-meta", taskId] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });

  const setAssignees = useMutation({
    mutationFn: async ({ ids, role }: { ids: string[]; role: "assignee" | "reviewer" }) => {
      const { error: delErr } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", taskId)
        .eq("role", role);
      if (delErr) throw delErr;
      if (ids.length > 0) {
        const rows = ids.map((uid) => ({ task_id: taskId, user_id: uid, role }));
        const { error } = await supabase.from("task_assignees").insert(rows as never);
        if (error) throw error;
      }
      // Keep the singleton column in sync for backward compat across views.
      const patch =
        role === "assignee" ? { assignee_id: ids[0] ?? null } : { reviewer_id: ids[0] ?? null };
      const { error: tErr } = await supabase
        .from("tasks")
        .update(patch as never)
        .eq("id", taskId);
      if (tErr) throw tErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-assignees", taskId] });
      qc.invalidateQueries({ queryKey: ["task-meta", taskId] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    task,
    isLoading: taskQuery.isLoading,
    firmId,
    projectStages,
    difficultyLevels,
    urgencyLevels,
    assigneeIds,
    reviewerIds,
    updateField,
    setAssignees,
  };
}
