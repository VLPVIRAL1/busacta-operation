import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/auth/auth-context";

/**
 * Read queries for the Admin hub. Mutations stay co-located with their UI
 * (optimistic updates / captcha gates are tightly coupled).
 */

export type InviteRow = {
  id: string;
  email: string;
  role: AppRole;
  firm_id: string | null;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
};

export const invitationsQuery = () =>
  queryOptions({
    queryKey: ["invitations"],
    queryFn: async (): Promise<InviteRow[]> => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, firm_id, token, accepted_at, expires_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });

export type FirmListItem = { id: string; name: string };

export const firmsListQuery = () =>
  queryOptions({
    queryKey: ["firms-list"],
    queryFn: async (): Promise<FirmListItem[]> => {
      const { data } = await supabase.from("firms").select("id, name").order("name");
      return (data ?? []) as FirmListItem[];
    },
  });

export type TeamData = {
  profiles: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    position: string | null;
    specialty: string | null;
    phone: string | null;
    avatar_url: string | null;
    status: string | null;
    department: string | null;
    provisioned_via: string | null;
  }>;
  roles: Map<string, AppRole[]>;
};

export const usersRolesQuery = () =>
  queryOptions({
    queryKey: ["users-roles"],
    queryFn: async (): Promise<TeamData> => {
      const profilesRes = await (supabase
        .from("profiles")
        .select(
          "id, full_name, email, position, specialty, phone, avatar_url, status, department, provisioned_via" as never,
        )
        .order("full_name") as unknown as Promise<{
        data: TeamData["profiles"] | null;
      }>);
      const rolesRes = await supabase.from("user_roles").select("user_id, role");
      const roles = new Map<string, AppRole[]>();
      for (const r of rolesRes.data ?? []) {
        const arr = roles.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        roles.set(r.user_id, arr);
      }
      return {
        profiles: (profilesRes.data ?? []) as TeamData["profiles"],
        roles,
      };
    },
  });

export const roleCapabilitiesQuery = () =>
  queryOptions({
    queryKey: ["role-capabilities"],
    queryFn: async (): Promise<Map<string, boolean>> => {
      const { data, error } = await supabase
        .from("role_capabilities")
        .select("role, capability, allowed");
      if (error) throw error;
      const map = new Map<string, boolean>();
      for (const r of data ?? []) map.set(`${r.role}:${r.capability}`, r.allowed);
      return map;
    },
  });

export type TaskPermissionsAuditRow = {
  task_id: string;
  user_id: string;
  can_view: boolean;
  can_edit_fields: boolean;
  can_edit_time: boolean;
  can_manage_subtasks: boolean;
  can_manage_attachments: boolean;
  can_change_status: boolean;
  updated_at: string;
};

export type TaskPermissionsAuditProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type TaskPermissionsAuditData = {
  rows: TaskPermissionsAuditRow[];
  tasks: Map<string, string>;
  profiles: Map<string, TaskPermissionsAuditProfile>;
};

export const teamTaskPermissionsAuditQuery = () =>
  queryOptions({
    queryKey: ["team-task-permissions-audit"],
    queryFn: async (): Promise<TaskPermissionsAuditData> => {
      const { data: rows, error } = await supabase
        .from("task_permissions")
        .select(
          "task_id, user_id, can_view, can_edit_fields, can_edit_time, can_manage_subtasks, can_manage_attachments, can_change_status, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const taskIds = Array.from(new Set((rows ?? []).map((r) => r.task_id)));
      const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
      const [tasksRes, profilesRes] = await Promise.all([
        taskIds.length
          ? supabase.from("tasks").select("id, title").in("id", taskIds)
          : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
        userIds.length
          ? supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", userIds)
          : Promise.resolve({
              data: [] as TaskPermissionsAuditProfile[],
            }),
      ]);
      const tasks = new Map((tasksRes.data ?? []).map((t) => [t.id, t.title as string]));
      const profiles = new Map(
        (profilesRes.data ?? []).map((p) => [p.id, p as TaskPermissionsAuditProfile]),
      );
      return { rows: (rows ?? []) as TaskPermissionsAuditRow[], tasks, profiles };
    },
  });

export type ClientErrorRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  role: string | null;
  route: string | null;
  name: string | null;
  message: string | null;
  stack: string | null;
  component_stack: string | null;
  ua: string | null;
};

export const clientErrorsQuery = () =>
  queryOptions({
    queryKey: ["admin", "client-errors"],
    queryFn: async (): Promise<ClientErrorRow[]> => {
      const { data, error } = await supabase
        .from("client_error_log" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as ClientErrorRow[];
    },
    staleTime: 30_000,
  });

export type RestoreDrillRow = {
  id: string;
  drill_date: string;
  outcome: string;
  rto_minutes: number | null;
  rpo_minutes: number | null;
  evidence_url: string | null;
  notes: string | null;
};

export const restoreDrillLogQuery = () =>
  queryOptions({
    queryKey: ["restore-drill-log"],
    queryFn: async (): Promise<RestoreDrillRow[]> => {
      const { data, error } = await supabase
        .from("restore_drill_log" as never)
        .select("id, drill_date, outcome, rto_minutes, rpo_minutes, evidence_url, notes")
        .order("drill_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as RestoreDrillRow[];
    },
  });

export type IncidentRow = {
  id: string;
  occurred_at: string;
  severity: string;
  scenario: string;
  summary: string;
  status: string;
  is_tabletop: boolean;
  actions_taken: string | null;
  post_mortem: string | null;
};

export const incidentRecordsQuery = () =>
  queryOptions({
    queryKey: ["incident-records"],
    queryFn: async (): Promise<IncidentRow[]> => {
      const { data, error } = await supabase
        .from("incident_records" as never)
        .select(
          "id, occurred_at, severity, scenario, summary, status, is_tabletop, actions_taken, post_mortem",
        )
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as IncidentRow[];
    },
  });

export type PerfRow = {
  id: string;
  route: string;
  ttfb_ms: number | null;
  fcp_ms: number | null;
  load_ms: number | null;
  query_ms: number | null;
  render_ms: number | null;
  user_agent: string | null;
  created_at: string;
};

export const perfEventsQuery = (hours: number, sinceIso: string) =>
  queryOptions({
    queryKey: ["admin", "perf", hours],
    queryFn: async (): Promise<PerfRow[]> => {
      const { data, error } = await supabase
        .from("page_perf_events" as never)
        .select("*")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as PerfRow[];
    },
    staleTime: 30_000,
  });

export type HubPermProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string | null;
};
export type HubPermRow = { user_id: string; module_key: string; allowed: boolean };

export const hubPermsProfilesQuery = () =>
  queryOptions({
    queryKey: ["hub-perms", "profiles"],
    queryFn: async (): Promise<HubPermProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email,status")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HubPermProfileRow[];
    },
  });

export const moduleHubsSettingsQuery = () =>
  queryOptions({
    queryKey: ["app-settings", "system", "module-hubs"],
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("id", "system")
        .maybeSingle();
      return ((data?.value ?? {}) as { module_hubs?: Record<string, boolean> }).module_hubs ?? {};
    },
  });

export const hubPermsRowsQuery = () =>
  queryOptions({
    queryKey: ["hub-perms", "rows"],
    queryFn: async (): Promise<HubPermRow[]> => {
      const { data, error } = await supabase
        .from("user_hub_permissions" as never)
        .select("user_id,module_key,allowed");
      if (error) throw error;
      return (data ?? []) as unknown as HubPermRow[];
    },
  });

export type ComplianceAuditRow = {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip: string | null;
};

export type ComplianceSensitiveRow = {
  id: string;
  occurred_at: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  ip: string | null;
};

export const mfaCoverageQuery = () =>
  queryOptions({
    queryKey: ["compliance-mfa-coverage"],
    queryFn: async (): Promise<{ totalRequired: number; enrolled: number }> => {
      const { data, error } = await supabase.rpc("mfa_required_coverage" as never);
      if (error) throw error;
      const r = (data ?? {}) as { total_required?: number; enrolled?: number };
      return { totalRequired: r.total_required ?? 0, enrolled: r.enrolled ?? 0 };
    },
  });

export const complianceSensitiveQuery = (search: string) =>
  queryOptions({
    queryKey: ["compliance-sensitive", search],
    queryFn: async (): Promise<ComplianceSensitiveRow[]> => {
      let q = supabase
        .from("sensitive_action_log" as never)
        .select("id, occurred_at, actor_id, action, target_id, ip")
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (search) q = q.ilike("action", `%${search}%`) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ComplianceSensitiveRow[];
    },
  });

export const complianceAuditQuery = (search: string) =>
  queryOptions({
    queryKey: ["compliance-audit", search],
    queryFn: async (): Promise<ComplianceAuditRow[]> => {
      let q = supabase
        .from("audit_log" as never)
        .select("id, occurred_at, actor_id, actor_role, action, resource_type, resource_id, ip")
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (search) q = q.or(`action.ilike.%${search}%,resource_type.ilike.%${search}%`) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ComplianceAuditRow[];
    },
  });

export type AuditStaffRow = { id: string; full_name: string | null; email: string | null };
export type AuditFirmRow = { id: string; name: string };

export const auditStaffQuery = () =>
  queryOptions({
    queryKey: ["audit-staff"],
    queryFn: async (): Promise<AuditStaffRow[]> => {
      const { data: r } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "employee"]);
      const ids = Array.from(new Set((r ?? []).map((x) => x.user_id)));
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (data ?? []) as AuditStaffRow[];
    },
  });

export const auditFirmsQuery = () =>
  queryOptions({
    queryKey: ["audit-firms"],
    queryFn: async (): Promise<AuditFirmRow[]> => {
      const { data } = await supabase.from("firms").select("id, name").order("name");
      return (data ?? []) as AuditFirmRow[];
    },
  });
