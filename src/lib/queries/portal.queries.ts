import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Portal contact / firm resolution ──────────────────────────────────────────

export type PortalContact = { id: string; firm_id: string; portal_enabled: boolean };

/** Resolve the signed-in client to their portal-enabled firm contact (shared cache). */
export const portalContactQuery = (email: string | null) =>
  queryOptions({
    queryKey: ["portal-contact", email],
    enabled: !!email,
    queryFn: async (): Promise<PortalContact | null> => {
      const { data, error } = await supabase
        .from("firm_contacts")
        .select("id, firm_id, portal_enabled")
        .ilike("email", email!)
        .eq("portal_enabled", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PortalContact | null;
    },
  });

// Client-portal read queries. Every table below is protected by RLS that scopes
// rows to the caller's firm (see migrations); these queries mirror the shape of
// `portal-documents.tsx` but live in the data layer per project convention. We
// still pass `firmId` to scope query keys and as a defensive client-side filter.

// ── SOPs ────────────────────────────────────────────────────────────────────

export type PortalSop = {
  id: string;
  title: string;
  body: string | null;
  project_id: string | null;
  firm_id: string | null;
};

/** Non-internal SOPs the client may read (RLS: `Clients read non-internal sops`). */
export const portalSopsQuery = (firmId: string | null) =>
  queryOptions({
    queryKey: ["portal", "sops", firmId],
    enabled: !!firmId,
    queryFn: async (): Promise<PortalSop[]> => {
      const { data, error } = await supabase
        .from("sops")
        .select("id, title, body, project_id, firm_id")
        .eq("is_internal", false)
        .order("title", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as PortalSop[];
    },
  });

// ── Pipeline ──────────────────────────────────────────────────────────────────

export type PortalPipelineStage = {
  id: string;
  project_id: string;
  label: string;
  color: string | null;
  sort_order: number;
  is_terminal: boolean;
  projects: { id: string; name: string; code: string | null; firm_id: string } | null;
};

export type PortalPipelineTask = {
  id: string;
  project_id: string | null;
  pipeline_stage_id: string | null;
  status: string | null;
};

export type PortalPipelineData = {
  stages: PortalPipelineStage[];
  tasks: PortalPipelineTask[];
};

/** Pipeline stages + task placement for the firm's projects (read-only progress). */
export const portalPipelineQuery = (firmId: string | null) =>
  queryOptions({
    queryKey: ["portal", "pipeline", firmId],
    enabled: !!firmId,
    queryFn: async (): Promise<PortalPipelineData> => {
      const [stagesRes, tasksRes] = await Promise.all([
        supabase
          .from("project_pipeline_stages")
          .select(
            "id, project_id, label, color, sort_order, is_terminal, projects(id, name, code, firm_id)",
          )
          .order("sort_order", { ascending: true }),
        supabase.from("tasks").select("id, project_id, pipeline_stage_id, status"),
      ]);
      if (stagesRes.error) throw stagesRes.error;
      if (tasksRes.error) throw tasksRes.error;
      const stages = ((stagesRes.data ?? []) as unknown as PortalPipelineStage[]).filter(
        (s) => s.projects?.firm_id === firmId,
      );
      const projectIds = new Set(stages.map((s) => s.project_id));
      const tasks = ((tasksRes.data ?? []) as unknown as PortalPipelineTask[]).filter(
        (t) => t.project_id && projectIds.has(t.project_id),
      );
      return { stages, tasks };
    },
  });

// ── Audit trail ───────────────────────────────────────────────────────────────

export type PortalAuditEvent = {
  id: string;
  task_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  tasks: { title: string | null } | null;
};

/** Client-visible task audit (RLS limits to status_changed / assignee_changed). */
export const portalAuditQuery = (firmId: string | null) =>
  queryOptions({
    queryKey: ["portal", "audit", firmId],
    enabled: !!firmId,
    queryFn: async (): Promise<PortalAuditEvent[]> => {
      const { data, error } = await supabase
        .from("task_audit")
        .select("id, task_id, event_type, payload, created_at, tasks(title)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as PortalAuditEvent[];
    },
  });

// ── Timesheet (aggregate) ───────────────────────────────────────────────────

export type PortalTimeSummaryRow = {
  project_id: string;
  project_name: string;
  project_code: string | null;
  task_id: string;
  task_title: string;
  total_minutes: number;
  entry_count: number;
};

/** Billable time rolled up per task/project via the aggregate-only RPC. */
export const portalTimesheetQuery = (firmId: string | null) =>
  queryOptions({
    queryKey: ["portal", "timesheet", firmId],
    enabled: !!firmId,
    queryFn: async (): Promise<PortalTimeSummaryRow[]> => {
      const { data, error } = await supabase.rpc("portal_billable_time_summary");
      if (error) throw error;
      return (data ?? []) as PortalTimeSummaryRow[];
    },
  });

// ── Open points ───────────────────────────────────────────────────────────────

type OpenPointScope = { firm_id?: string; project_id?: string };

const OPEN_POINT_SELECT =
  "id, title, body, status, created_at, open_point_replies(id, author_id, body, created_at)";

export type PortalOpenPointReply = {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
};

export type PortalOpenPoint = {
  id: string;
  title: string;
  body: string | null;
  status: "open" | "answered" | "resolved";
  created_at: string;
  open_point_replies: PortalOpenPointReply[];
};

/** Open points (questions) the firm raised for this client, with reply threads. */
export const portalOpenPointsQuery = (firmId: string | null) =>
  queryOptions({
    queryKey: ["portal", "open-points", firmId],
    enabled: !!firmId,
    queryFn: async (): Promise<PortalOpenPoint[]> => {
      const { data, error } = await supabase
        .from("open_points")
        .select(OPEN_POINT_SELECT)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown as PortalOpenPoint[]).map((p) => ({
        ...p,
        open_point_replies: [...(p.open_point_replies ?? [])].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        ),
      }));
    },
  });

export type OpenPointAdmin = PortalOpenPoint;

/** Scoped list for the internal authoring panel (firm- or project-scoped). */
export const openPointsForScopeQuery = (scope: OpenPointScope) =>
  queryOptions({
    queryKey: ["open-points", scope],
    queryFn: async (): Promise<OpenPointAdmin[]> => {
      let q = supabase
        .from("open_points")
        .select(OPEN_POINT_SELECT)
        .order("created_at", { ascending: false });
      if (scope.firm_id) q = q.eq("firm_id", scope.firm_id);
      if (scope.project_id) q = q.eq("project_id", scope.project_id);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as OpenPointAdmin[]).map((p) => ({
        ...p,
        open_point_replies: [...(p.open_point_replies ?? [])].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        ),
      }));
    },
  });

export async function createOpenPoint(
  scope: OpenPointScope,
  input: { title: string; body: string; createdBy: string },
) {
  const { error } = await supabase.from("open_points").insert({
    ...scope,
    title: input.title,
    body: input.body,
    created_by: input.createdBy,
  });
  if (error) throw error as Error;
}

export async function setOpenPointStatus(
  id: string,
  status: PortalOpenPoint["status"],
  userId: string | null,
) {
  const patch =
    status === "resolved"
      ? { status, resolved_by: userId, resolved_at: new Date().toISOString() }
      : { status, resolved_by: null, resolved_at: null };
  const { error } = await supabase.from("open_points").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteOpenPoint(id: string) {
  const { error } = await supabase.from("open_points").delete().eq("id", id);
  if (error) throw error;
}

export async function addOpenPointReply(openPointId: string, authorId: string, body: string) {
  const { error } = await supabase.from("open_point_replies").insert({
    open_point_id: openPointId,
    author_id: authorId,
    body,
  });
  if (error) throw error;
}
