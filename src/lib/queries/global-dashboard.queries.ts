import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============ Shared filter primitives ============
export type DashboardPeriod = 5 | 10 | 15 | 30 | 60 | "all";
export type DashboardScope = "assignee" | "reviewer" | "watcher";
export type DashboardMetric = "total" | "bat" | "with_client" | "on_hold" | "completed";

const METRIC_TO_STATUS: Record<DashboardMetric, string | null> = {
  total: null, // open only (status != complete)
  bat: "review",
  with_client: "waiting_client",
  on_hold: "draft",
  completed: "complete",
};

function periodSince(period: DashboardPeriod): string | null {
  if (period === "all") return null;
  return new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();
}

// ============ Filter-aware dashboard tasks ============
export type DashboardTaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  display_id: string | null;
  project_id: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  completed_at: string | null;
  created_at: string;
  entity_id: string | null;
  direct_client_id: string | null;
  client_entities: {
    name: string | null;
    projects: {
      id: string;
      name: string;
      code: string | null;
      firms: { id: string; name: string; firm_identifier: string | null } | null;
    } | null;
  } | null;
  direct_clients: { id: string; display_name: string | null } | null;
  /** A=Assignee, R=Reviewer, W=Watcher (relative to filter userIds) */
  roles: ("A" | "R" | "W")[];
};

const DASHBOARD_TASK_PROJECTION =
  "id, title, status, due_date, display_id, project_id, assignee_id, reviewer_id, completed_at, created_at, entity_id, direct_client_id, client_entities(name, projects(id, name, code, firms(id, name, firm_identifier))), direct_clients(id, display_name)";

export interface DashboardTasksOpts {
  userIds: string[];
  scope: DashboardScope[];
  period: DashboardPeriod;
}

export const dashboardTasksQuery = (opts: DashboardTasksOpts) =>
  queryOptions({
    queryKey: [
      "global-dashboard",
      "dashboard-tasks",
      [...opts.userIds].sort().join(","),
      [...opts.scope].sort().join(","),
      String(opts.period),
    ],
    queryFn: async (): Promise<DashboardTaskRow[]> => {
      const { userIds, scope, period } = opts;
      if (userIds.length === 0 || scope.length === 0) return [];
      const since = periodSince(period);

      const roleMap = new Map<string, Set<"A" | "R" | "W">>();
      const rowMap = new Map<string, DashboardTaskRow>();
      const stamp = (id: string, role: "A" | "R" | "W") => {
        if (!roleMap.has(id)) roleMap.set(id, new Set());
        roleMap.get(id)!.add(role);
      };

      const runIn = async (col: "assignee_id" | "reviewer_id", role: "A" | "R") => {
        let q = supabase.from("tasks").select(DASHBOARD_TASK_PROJECTION).in(col, userIds);
        if (since) q = q.or(`created_at.gte.${since},completed_at.gte.${since}`);
        const { data } = await q.limit(1000);
        for (const r of (data ?? []) as unknown as DashboardTaskRow[]) {
          rowMap.set(r.id, r);
          stamp(r.id, role);
        }
      };

      if (scope.includes("assignee")) await runIn("assignee_id", "A");
      if (scope.includes("reviewer")) await runIn("reviewer_id", "R");
      if (scope.includes("watcher")) {
        const { data: w } = await supabase
          .from("task_watchers")
          .select("task_id")
          .in("user_id", userIds);
        const wids = Array.from(new Set((w ?? []).map((r) => r.task_id as string)));
        if (wids.length) {
          let q = supabase.from("tasks").select(DASHBOARD_TASK_PROJECTION).in("id", wids);
          if (since) q = q.or(`created_at.gte.${since},completed_at.gte.${since}`);
          const { data } = await q.limit(1000);
          for (const r of (data ?? []) as unknown as DashboardTaskRow[]) {
            if (!rowMap.has(r.id)) rowMap.set(r.id, r);
            stamp(r.id, "W");
          }
        }
      }

      return Array.from(rowMap.values()).map((r) => ({
        ...r,
        roles: Array.from(roleMap.get(r.id) ?? []),
      }));
    },
    enabled: opts.userIds.length > 0 && opts.scope.length > 0,
  });

export function bucketDashboardTasks(rows: DashboardTaskRow[]) {
  const open = rows.filter((r) => r.status !== "complete");
  return {
    total: open,
    bat: rows.filter((r) => r.status === "review"),
    with_client: rows.filter((r) => r.status === "waiting_client"),
    on_hold: rows.filter((r) => r.status === "draft"),
    completed: rows.filter((r) => r.status === "complete"),
  };
}

/**
 * Global Workspace Dashboard — Tab 1 metrics.
 *
 * Mapping of business labels → task_status enum values:
 *   - Total         → all open + closed
 *   - BAT           → status = 'review'        (Blocked/Awaiting in Triage)
 *   - With Client   → status = 'waiting_client'
 *   - On Hold       → status = 'draft'
 *   - Completed     → status = 'complete'
 *
 * Window: last 30 days (by created_at OR completed_at for Completed).
 * Scope:  assignee_id = current user.
 */
export const globalDashboardMetricsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "metrics", userId],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const head = { count: "exact" as const, head: true };

      const [total, bat, withClient, onHold, completed] = await Promise.all([
        supabase
          .from("tasks")
          .select("id", head)
          .eq("assignee_id", userId)
          .gte("created_at", since),
        supabase
          .from("tasks")
          .select("id", head)
          .eq("assignee_id", userId)
          .eq("status", "review")
          .gte("created_at", since),
        supabase
          .from("tasks")
          .select("id", head)
          .eq("assignee_id", userId)
          .eq("status", "waiting_client")
          .gte("created_at", since),
        supabase
          .from("tasks")
          .select("id", head)
          .eq("assignee_id", userId)
          .eq("status", "draft")
          .gte("created_at", since),
        supabase
          .from("tasks")
          .select("id", head)
          .eq("assignee_id", userId)
          .eq("status", "complete")
          .gte("completed_at", since),
      ]);

      return {
        total: total.count ?? 0,
        bat: bat.count ?? 0,
        withClient: withClient.count ?? 0,
        onHold: onHold.count ?? 0,
        completed: completed.count ?? 0,
      };
    },
    enabled: !!userId,
  });

export type QuickTask = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  display_id: string | null;
  project_id: string | null;
};

/**
 * Tab 1 middle column — current user's open tasks (excluding `complete`).
 * Ordered by due date ascending (nulls last), then created_at desc.
 */
export const quickTaskListQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "quick-tasks", userId],
    queryFn: async (): Promise<QuickTask[]> => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, status, due_date, display_id, project_id")
        .eq("assignee_id", userId)
        .neq("status", "complete")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as QuickTask[];
    },
    enabled: !!userId,
  });

export type ReminderPriority = "low" | "normal" | "high";
export type ReminderRecurrence = "daily" | "weekly" | "monthly";

export type ReminderShareTarget = { id: string; name: string };

export type Reminder = {
  id: string;
  owner_id: string;
  body: string;
  body_rich: unknown | null;
  remind_at: string | null;
  completed_at: string | null;
  created_at: string;
  color: string | null;
  priority: ReminderPriority;
  recurrence: ReminderRecurrence | null;
  /** True when the current user created the reminder (vs. it being shared with them). */
  is_owner: boolean;
  /** Owner's display name — populated only for reminders shared *with* the current user. */
  owner_name: string | null;
  /** Recipients this reminder is shared with — populated only for reminders the user owns. */
  shared_with: ReminderShareTarget[];
  /** Set when the reminder was submitted via a public link by an external sender. */
  external_sender_name: string | null;
  source: "self" | "public";
};

type RawReminder = {
  id: string;
  user_id: string;
  body: string;
  body_rich: unknown | null;
  remind_at: string | null;
  completed_at: string | null;
  created_at: string;
  color: string | null;
  priority: string | null;
  recurrence: string | null;
  external_sender_name: string | null;
  source: string | null;
};

/**
 * `reminder_shares` is created by migration 20260531020000 and is not yet in the
 * generated Supabase types. Access it through an untyped handle, consistent with
 * the casting style used throughout this file, until types.ts is regenerated.
 */
const reminderShares = () =>
  (supabase as unknown as { from: (t: string) => any }).from("reminder_shares");

/**
 * Reminders the user owns *plus* reminders shared with them. Owners see who a
 * reminder is shared with; recipients see who shared it. Degrades gracefully to
 * personal-only if the sharing table is not present yet.
 */
export const remindersQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "reminders", userId],
    queryFn: async (): Promise<Reminder[]> => {
      const ownedRes = await supabase.from("personal_reminders").select("*").eq("user_id", userId);
      const owned = (ownedRes.data ?? []) as unknown as RawReminder[];

      let sharedRows: RawReminder[] = [];
      let shareLinks: { reminder_id: string; user_id: string }[] = [];
      try {
        const mine = await reminderShares().select("reminder_id").eq("user_id", userId);
        const sharedIds = ((mine.data ?? []) as { reminder_id: string }[]).map(
          (s) => s.reminder_id,
        );
        if (sharedIds.length) {
          const res = await supabase.from("personal_reminders").select("*").in("id", sharedIds);
          sharedRows = (res.data ?? []) as unknown as RawReminder[];
        }
        const ownedIds = owned.map((r) => r.id);
        if (ownedIds.length) {
          const links = await reminderShares()
            .select("reminder_id, user_id")
            .in("reminder_id", ownedIds);
          shareLinks = (links.data ?? []) as { reminder_id: string; user_id: string }[];
        }
      } catch {
        // reminder_shares not migrated yet — fall back to personal reminders only.
      }

      // Resolve display names for owners (of shared-with-me) and recipients (of my shares).
      const nameIds = new Set<string>();
      for (const r of sharedRows) nameIds.add(r.user_id);
      for (const l of shareLinks) nameIds.add(l.user_id);
      const nameMap = new Map<string, string>();
      if (nameIds.size) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", Array.from(nameIds));
        for (const p of profs ?? [])
          nameMap.set(p.id as string, (p.full_name as string) ?? (p.email as string) ?? "Unknown");
      }

      const sharedByReminder = new Map<string, ReminderShareTarget[]>();
      for (const l of shareLinks) {
        const arr = sharedByReminder.get(l.reminder_id) ?? [];
        arr.push({ id: l.user_id, name: nameMap.get(l.user_id) ?? "Unknown" });
        sharedByReminder.set(l.reminder_id, arr);
      }

      const toReminder = (r: RawReminder, isOwner: boolean): Reminder => ({
        id: r.id,
        owner_id: r.user_id,
        body: r.body,
        body_rich: (r as { body_rich?: unknown }).body_rich ?? null,
        remind_at: r.remind_at,
        completed_at: r.completed_at,
        created_at: r.created_at,
        color: r.color ?? null,
        priority: ((r.priority as ReminderPriority) || "normal") as ReminderPriority,
        recurrence: (r.recurrence as ReminderRecurrence | null) ?? null,
        is_owner: isOwner,
        owner_name: isOwner ? null : (nameMap.get(r.user_id) ?? null),
        shared_with: isOwner ? (sharedByReminder.get(r.id) ?? []) : [],
        external_sender_name:
          (r as { external_sender_name?: string | null }).external_sender_name ?? null,
        source: (r as { source?: string | null }).source === "public" ? "public" : "self",
      });

      const byId = new Map<string, Reminder>();
      for (const r of owned) byId.set(r.id, toReminder(r, true));
      for (const r of sharedRows) if (!byId.has(r.id)) byId.set(r.id, toReminder(r, false));

      const all = Array.from(byId.values());
      const PRIORITY_RANK: Record<ReminderPriority, number> = { high: 0, normal: 1, low: 2 };
      all.sort((a, b) => {
        const ac = a.completed_at ? 1 : 0;
        const bc = b.completed_at ? 1 : 0;
        if (ac !== bc) return ac - bc;
        if (!a.completed_at) {
          if (a.priority !== b.priority)
            return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        }
        const ar = a.remind_at ? Date.parse(a.remind_at) : Number.POSITIVE_INFINITY;
        const br = b.remind_at ? Date.parse(b.remind_at) : Number.POSITIVE_INFINITY;
        if (ar !== br) return ar - br;
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      });
      return all;
    },
    enabled: !!userId,
  });

/** Share recipients for a reminder, with display names. Owner-only data. */
export async function listReminderShares(
  reminderId: string,
): Promise<{ id: string; user_id: string; name: string }[]> {
  try {
    const { data: shares } = await reminderShares()
      .select("id, user_id")
      .eq("reminder_id", reminderId);
    const rows = (shares ?? []) as { id: string; user_id: string }[];
    if (!rows.length) return [];
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in(
        "id",
        rows.map((s) => s.user_id),
      );
    const pm = new Map(
      (profs ?? []).map((p) => [
        p.id as string,
        (p.full_name as string) ?? (p.email as string) ?? "Unknown",
      ]),
    );
    return rows.map((s) => ({
      id: s.id,
      user_id: s.user_id,
      name: pm.get(s.user_id) ?? "Unknown",
    }));
  } catch {
    return [];
  }
}

export async function addReminderShare(
  reminderId: string,
  userId: string,
  grantedBy: string,
): Promise<void> {
  const { error } = await reminderShares().upsert(
    { reminder_id: reminderId, user_id: userId, granted_by: grantedBy },
    { onConflict: "reminder_id,user_id" },
  );
  if (error) throw error;
}

export async function removeReminderShare(shareId: string): Promise<void> {
  const { error } = await reminderShares().delete().eq("id", shareId);
  if (error) throw error;
}

/** A recipient removing themselves from a reminder shared with them. */
export async function leaveReminderShare(reminderId: string, userId: string): Promise<void> {
  const { error } = await reminderShares()
    .delete()
    .eq("reminder_id", reminderId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ===== Reminder public links =====
export type ReminderPublicToken = {
  id: string;
  token: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
};

const publicTokens = () =>
  (supabase as unknown as { from: (t: string) => any }).from("reminder_public_tokens");

export const reminderPublicTokensQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "reminder-public-tokens", userId],
    queryFn: async (): Promise<ReminderPublicToken[]> => {
      try {
        const { data } = await publicTokens()
          .select("id, token, label, created_at, revoked_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        return (data ?? []) as ReminderPublicToken[];
      } catch {
        return [];
      }
    },
    enabled: !!userId,
  });

function randomToken(): string {
  // 24-char URL-safe token. Collision-resistant for a per-user namespace.
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createReminderPublicToken(
  userId: string,
  label: string | null,
): Promise<ReminderPublicToken> {
  const token = randomToken();
  const { data, error } = await publicTokens()
    .insert({ user_id: userId, token, label })
    .select("id, token, label, created_at, revoked_at")
    .single();
  if (error) throw error;
  return data as ReminderPublicToken;
}

export async function revokeReminderPublicToken(id: string): Promise<void> {
  const { error } = await publicTokens()
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteReminderPublicToken(id: string): Promise<void> {
  const { error } = await publicTokens().delete().eq("id", id);
  if (error) throw error;
}

export type PublicReminderOwner = { owner_name: string; label: string | null };

export async function fetchPublicReminderOwner(token: string): Promise<PublicReminderOwner | null> {
  const { data, error } = await (
    supabase as unknown as { rpc: (fn: string, args: object) => any }
  ).rpc("get_public_reminder_owner", { p_token: token });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as PublicReminderOwner;
}

export async function submitPublicReminder(args: {
  token: string;
  body: string;
  bodyRich: unknown;
  senderName: string;
  remindAt: string | null;
}): Promise<string> {
  const { data, error } = await (
    supabase as unknown as { rpc: (fn: string, args: object) => any }
  ).rpc("submit_public_reminder", {
    p_token: args.token,
    p_body: args.body,
    p_body_rich: args.bodyRich ?? null,
    p_sender_name: args.senderName,
    p_remind_at: args.remindAt,
  });
  if (error) throw error;
  return data as string;
}

// ===== Daily Notes (multi-note per day, grouped by month) =====
export type DailyNote = {
  id: string;
  owner_id: string;
  note_date: string;
  title: string;
  content_json: unknown;
  color: string | null;
  is_pinned: boolean;
  tags: string[];
  updated_at: string;
  updated_by: string | null;
  created_at: string;
};

export type DailyNoteSummary = {
  id: string;
  note_date: string;
  title: string;
  color: string | null;
  is_pinned: boolean;
  tags: string[];
  updated_at: string;
};

/** Single note by id (owner or shared). */
export const noteByIdQuery = (noteId: string | null) =>
  queryOptions({
    queryKey: ["global-dashboard", "daily-note-by-id", noteId],
    queryFn: async (): Promise<DailyNote | null> => {
      if (!noteId) return null;
      const { data } = await supabase
        .from("daily_notes")
        .select(
          "id, owner_id, note_date, title, color, is_pinned, tags, content_json, updated_at, updated_by, created_at",
        )
        .eq("id", noteId)
        .maybeSingle();
      if (!data) return null;
      const d = data as unknown as DailyNote & { tags?: string[] | null };
      return { ...d, tags: d.tags ?? [] } as DailyNote;
    },
    enabled: !!noteId,
  });

/** All notes owned by user inside a YYYY-MM month. */
export const notesByMonthQuery = (userId: string, monthYYYYMM: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "notes-by-month", userId, monthYYYYMM],
    queryFn: async (): Promise<DailyNoteSummary[]> => {
      const start = `${monthYYYYMM}-01`;
      const [y, m] = monthYYYYMM.split("-").map(Number);
      const next = new Date(Date.UTC(y, m, 1));
      const end = next.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("daily_notes")
        .select("id, note_date, title, color, is_pinned, tags, updated_at")
        .eq("owner_id", userId)
        .gte("note_date", start)
        .lt("note_date", end)
        .order("note_date", { ascending: false })
        .order("updated_at", { ascending: false });
      return ((data ?? []) as unknown as DailyNoteSummary[]).map((n) => ({
        ...n,
        tags: n.tags ?? [],
      }));
    },
    enabled: !!userId && !!monthYYYYMM,
  });

/** Notes shared with this user. */
export type SharedNote = DailyNoteSummary & { permission: string; owner_id: string };
export const sharedNotesQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "shared-notes", userId],
    queryFn: async (): Promise<SharedNote[]> => {
      const { data: shares } = await supabase
        .from("daily_note_shares")
        .select("note_id, permission")
        .eq("user_id", userId);
      const ids = (shares ?? []).map((s) => s.note_id as string);
      if (ids.length === 0) return [];
      const { data: notes } = await supabase
        .from("daily_notes")
        .select("id, note_date, title, color, is_pinned, tags, updated_at, owner_id")
        .in("id", ids);
      const permMap = new Map(
        (shares ?? []).map((s) => [s.note_id as string, s.permission as string]),
      );
      return (notes ?? []).map((n) => ({
        id: n.id,
        note_date: n.note_date,
        title: n.title ?? "Untitled",
        color: n.color ?? null,
        is_pinned: n.is_pinned ?? false,
        tags: ((n as { tags?: string[] | null }).tags ?? []) as string[],
        updated_at: n.updated_at,
        owner_id: n.owner_id,
        permission: permMap.get(n.id) ?? "view",
      }));
    },
    enabled: !!userId,
  });

// ===== Daily Notes — user templates =====
export type DailyNoteTemplateRow = {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  description: string;
  default_title: string;
  content_json: unknown;
  sort_order: number;
  updated_at: string;
};

export const dailyNoteTemplatesQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "daily-note-templates", userId],
    queryFn: async (): Promise<DailyNoteTemplateRow[]> => {
      const { data } = await supabase
        .from("daily_note_templates" as never)
        .select(
          "id, user_id, name, icon, description, default_title, content_json, sort_order, updated_at",
        )
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false });
      return (data ?? []) as unknown as DailyNoteTemplateRow[];
    },
    enabled: !!userId,
  });

// ===== Dashboard staff picker =====
export type DashboardStaffProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

/**
 * Internal staff for the dashboard "Users" filter — every active profile that
 * holds at least one non-`client` role. Clients are excluded so the picker
 * lists only teammates whose task workload can be viewed.
 */
export const dashboardStaffProfilesQuery = () =>
  queryOptions({
    queryKey: ["global-dashboard", "staff-profiles"],
    queryFn: async (): Promise<DashboardStaffProfile[]> => {
      const { data: roleRows } = await supabase.from("user_roles").select("user_id, role");
      const byUser = new Map<string, Set<string>>();
      for (const r of roleRows ?? []) {
        const id = r.user_id as string;
        if (!byUser.has(id)) byUser.set(id, new Set());
        byUser.get(id)!.add(String(r.role));
      }
      const staffIds = Array.from(byUser.entries())
        .filter(([, roles]) => Array.from(roles).some((role) => role !== "client"))
        .map(([id]) => id);
      if (!staffIds.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", staffIds)
        .eq("status", "active");
      return (data ?? []) as DashboardStaffProfile[];
    },
  });

// ===== Mention sources =====
export type MentionProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};
export type MentionTask = {
  id: string;
  title: string;
  display_id: string | null;
  kind: "task" | "project";
  sub: string | null;
};

export async function searchProfilesForMention(q: string): Promise<MentionProfile[]> {
  const query = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .eq("status", "active")
    .eq("provisioned_via" as never, "hr_hub" as never)
    .limit(8);
  const { data } = q ? await query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`) : await query;
  return (data ?? []) as MentionProfile[];
}

/** Tasks AND projects — only With BAT / With CPA / On Hold (no completed/archived). */
export async function searchTasksForMention(q: string): Promise<MentionTask[]> {
  const taskQ = supabase
    .from("tasks")
    .select(
      "id, title, display_id, status, projects(code, firms(firm_identifier, name)), client_entities:entity_id(name), direct_clients:direct_client_id(display_name), project_pipeline_stages(primary_state, label)",
    )
    .neq("status", "complete")
    // Over-fetch so the post-filter (which drops pipeline-completed tasks) still
    // has enough rows to return up to 50.
    .limit(300);
  const { data: tasks } = q
    ? await taskQ.or(`title.ilike.%${q}%,display_id.ilike.%${q}%`)
    : await taskQ.order("created_at", { ascending: false });

  const taskRows: MentionTask[] = (tasks ?? [])
    .map((t) => {
      const row = t as unknown as {
        id: string;
        title: string;
        display_id: string | null;
        status: string;
        projects: {
          code: string | null;
          firms: { firm_identifier: string | null; name: string | null } | null;
        } | null;
        client_entities: { name: string | null } | null;
        direct_clients: { display_name: string | null } | null;
        project_pipeline_stages?: { primary_state?: string | null; label?: string | null } | null;
      };
      const major = taskMajorHead(row);
      const firmId = row.projects?.firms?.firm_identifier ?? row.projects?.firms?.name ?? null;
      const projectId = row.projects?.code ?? null;
      // Subtitle shows firm · project only — client/entity name is intentionally
      // omitted so the task name (label) stays the focus of each row.
      const parts = [firmId, projectId].filter(Boolean);
      return {
        id: row.id,
        title: row.title,
        display_id: row.display_id,
        kind: "task" as const,
        major,
        sub: parts.length ? parts.join(" · ") : null,
      };
    })
    // Keep only the three active major heads — exclude anything rolled up to Completed.
    .filter((r) => r.major === "with_bat" || r.major === "with_cpa" || r.major === "on_hold")
    .slice(0, 50)
    .map(({ major: _major, ...rest }) => rest);
  return taskRows;
}

// ===== My Tasks (Tab 3) =====
export type MyTaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  display_id: string | null;
  project_id: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  completed_at: string | null;
  created_at: string;
  entity_id: string | null;
  direct_client_id: string | null;
  tax_year: number | null;
  period: string | null;
  client_entities: {
    name: string | null;
    projects: {
      id: string;
      name: string;
      code: string | null;
      firms: { id: string; name: string; firm_identifier: string | null } | null;
    } | null;
  } | null;
  direct_clients: { id: string; display_name: string | null } | null;
  direct_client_task_types: { id: string; label: string; code: string } | null;
  pipeline_stage_id: string | null;
  pipeline_stage: string | null;
  project_pipeline_stages: {
    id: string;
    label: string;
    key: string;
    primary_state: string | null;
    color: string | null;
  } | null;
};

const MY_TASK_PROJECTION =
  "id, title, status, due_date, display_id, project_id, assignee_id, reviewer_id, completed_at, created_at, entity_id, direct_client_id, tax_year, period, pipeline_stage_id, pipeline_stage, client_entities(name, projects(id, name, code, firms(id, name, firm_identifier))), direct_clients(id, display_name), direct_client_task_types(id, label, code), project_pipeline_stages(id, label, key, primary_state, color)";

// ============ Pipeline major-head mapping ============
// Detailed pipeline stages (e.g. "In Preparation", "Sign Pending") each roll up
// into one of four major heads. The stage's `primary_state` is authoritative;
// the legacy `tasks.status` enum is only a fallback for tasks created before
// pipeline stages existed.
export type MajorHead = "with_bat" | "with_cpa" | "on_hold" | "completed";

export const MAJOR_HEAD_TO_METRIC: Record<MajorHead, Exclude<DashboardMetric, "total">> = {
  with_bat: "bat",
  with_cpa: "with_client",
  on_hold: "on_hold",
  completed: "completed",
};

const LEGACY_STATUS_TO_MAJOR: Record<string, MajorHead> = {
  draft: "on_hold",
  in_progress: "with_bat",
  review: "with_bat",
  waiting_client: "with_cpa",
  complete: "completed",
};

const LEGACY_STATUS_LABEL: Record<string, string> = {
  draft: "On Hold",
  in_progress: "In Progress",
  review: "BAT Review",
  waiting_client: "With Client",
  complete: "Completed",
};

type StageBearing = {
  status: string;
  project_pipeline_stages?: { primary_state?: string | null; label?: string | null } | null;
};

/** Major head a task rolls up into — drives the KPI strip buckets and filters. */
export function taskMajorHead(row: StageBearing): MajorHead {
  const ps = row.project_pipeline_stages?.primary_state;
  if (ps === "with_bat" || ps === "with_cpa" || ps === "on_hold" || ps === "completed") return ps;
  return LEGACY_STATUS_TO_MAJOR[row.status] ?? "with_bat";
}

/** Detailed stage label for the task list badge (e.g. "In Preparation"). */
export function taskStageLabel(row: StageBearing): string {
  return row.project_pipeline_stages?.label ?? LEGACY_STATUS_LABEL[row.status] ?? row.status;
}

/** Sentinel value used in the Users filter to select tasks with no assignee. */
export const UNASSIGNED_SENTINEL = "__unassigned__";

/** Tasks assigned OR reviewed by the given users, plus completed in last 7 days. */
export const myTasksQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "my-tasks", userId],
    queryFn: async (): Promise<MyTaskRow[]> => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("tasks")
        .select(MY_TASK_PROJECTION)
        .eq("assignee_id", userId)
        .or(`status.neq.complete,completed_at.gte.${sevenDaysAgo}`)
        .order("created_at", { ascending: false })
        .limit(500);
      return (data ?? []) as unknown as MyTaskRow[];
    },
    enabled: !!userId,
  });

/** Multi-user variant: tasks where assignee_id OR reviewer_id is in userIds.
 *  If UNASSIGNED_SENTINEL is included, also fetches tasks with assignee_id IS NULL. */
export const myTasksMultiQuery = (userIds: string[]) =>
  queryOptions({
    queryKey: ["global-dashboard", "my-tasks-multi", [...userIds].sort().join(",")],
    queryFn: async (): Promise<MyTaskRow[]> => {
      if (userIds.length === 0) return [];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const includeUnassigned = userIds.includes(UNASSIGNED_SENTINEL);
      const realUserIds = userIds.filter((id) => id !== UNASSIGNED_SENTINEL);
      const seen = new Set<string>();
      const out: MyTaskRow[] = [];

      if (realUserIds.length > 0) {
        for (const col of ["assignee_id", "reviewer_id"] as const) {
          const { data } = await supabase
            .from("tasks")
            .select(MY_TASK_PROJECTION)
            .in(col, realUserIds)
            .or(`status.neq.complete,completed_at.gte.${sevenDaysAgo}`)
            .order("created_at", { ascending: false })
            .limit(500);
          for (const r of (data ?? []) as unknown as MyTaskRow[]) {
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            out.push(r);
          }
        }
      }

      if (includeUnassigned) {
        const { data } = await supabase
          .from("tasks")
          .select(MY_TASK_PROJECTION)
          .is("assignee_id", null)
          .or(`status.neq.complete,completed_at.gte.${sevenDaysAgo}`)
          .order("created_at", { ascending: false })
          .limit(500);
        for (const r of (data ?? []) as unknown as MyTaskRow[]) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          out.push(r);
        }
      }

      return out;
    },
    enabled: userIds.length > 0,
  });

/** All historical completed tasks for this user — used by the Show All toggle. */
export const myAllCompletedTasksQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "my-tasks-all-completed", userId],
    queryFn: async (): Promise<MyTaskRow[]> => {
      const { data } = await supabase
        .from("tasks")
        .select(MY_TASK_PROJECTION)
        .eq("assignee_id", userId)
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(2000);
      return (data ?? []) as unknown as MyTaskRow[];
    },
    enabled: !!userId,
  });

/** "My Day" flags for today. */
export const myDayFlagsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "my-day", userId],
    queryFn: async (): Promise<Set<string>> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("my_day_flags")
        .select("task_id")
        .eq("user_id", userId)
        .eq("flagged_for", today);
      return new Set((data ?? []).map((r) => r.task_id as string));
    },
    enabled: !!userId,
  });

/** Per-user manual ordering. */
export const taskOrderQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "task-order", userId],
    queryFn: async (): Promise<Map<string, number>> => {
      const { data } = await supabase
        .from("task_user_order")
        .select("task_id, sort_order")
        .eq("user_id", userId);
      const m = new Map<string, number>();
      for (const r of data ?? []) m.set(r.task_id as string, r.sort_order as number);
      return m;
    },
    enabled: !!userId,
  });

// ===== Today Agenda (Main Dashboard widget) =====
export type TodayAgendaItem =
  | {
      kind: "reminder";
      id: string;
      body: string;
      remind_at: string | null;
      priority: ReminderPriority;
      color: string | null;
      completed_at: string | null;
    }
  | {
      kind: "task";
      id: string;
      title: string;
      display_id: string | null;
      due_date: string;
      status: string;
    };

export const todayAgendaQuery = (userId: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "today-agenda", userId],
    queryFn: async (): Promise<TodayAgendaItem[]> => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const todayISO = todayStart.toISOString().slice(0, 10);

      const [remRes, taskRes] = await Promise.all([
        supabase
          .from("personal_reminders")
          .select("*")
          .eq("user_id", userId)
          .is("completed_at", null)
          .lte("remind_at", todayEnd.toISOString()),
        supabase
          .from("tasks")
          .select("id, title, display_id, due_date, status")
          .eq("assignee_id", userId)
          .neq("status", "complete")
          .eq("due_date", todayISO),
      ]);

      const reminders: TodayAgendaItem[] = (remRes.data ?? []).map((r) => ({
        kind: "reminder" as const,
        id: r.id,
        body: r.body,
        remind_at: r.remind_at ?? null,
        priority: ((r.priority as string) || "normal") as ReminderPriority,
        color: r.color ?? null,
        completed_at: null,
      }));

      const tasks: TodayAgendaItem[] = (taskRes.data ?? []).map((t) => ({
        kind: "task" as const,
        id: t.id as string,
        title: t.title as string,
        display_id: (t.display_id as string | null) ?? null,
        due_date: t.due_date as string,
        status: t.status as string,
      }));

      // Merge + sort: overdue reminders first (remind_at < today), then by time
      const all = [...reminders, ...tasks];
      all.sort((a, b) => {
        const aTime =
          a.kind === "reminder"
            ? a.remind_at
              ? new Date(a.remind_at).getTime()
              : 0
            : new Date(a.due_date).getTime();
        const bTime =
          b.kind === "reminder"
            ? b.remind_at
              ? new Date(b.remind_at).getTime()
              : 0
            : new Date(b.due_date).getTime();
        return aTime - bTime;
      });
      return all;
    },
    enabled: !!userId,
  });

// ===== Timesheet (Tab 4) =====
export type TimesheetEntry = {
  kind: "time_log" | "audit" | "attendance";
  id: string;
  at: string;
  task_id: string | null;
  task_title: string | null;
  task_display_id: string | null;
  duration_minutes: number | null;
  event_type: string | null;
  note: string | null;
  // attendance-specific
  check_in: string | null;
  check_out: string | null;
  attendance_status: string | null;
};

export const timesheetQuery = (userId: string, dayISO: string) =>
  queryOptions({
    queryKey: ["global-dashboard", "timesheet", userId, dayISO],
    queryFn: async (): Promise<TimesheetEntry[]> => {
      const start = new Date(`${dayISO}T00:00:00`).toISOString();
      const end = new Date(`${dayISO}T23:59:59.999`).toISOString();

      const [logsRes, auditRes, attendRes] = await Promise.all([
        supabase
          .from("time_logs")
          .select(
            "id, started_at, ended_at, duration_minutes, note, task_id, tasks(title, display_id)",
          )
          .eq("user_id", userId)
          .gte("started_at", start)
          .lte("started_at", end)
          .order("started_at", { ascending: true }),
        supabase
          .from("task_audit")
          .select("id, created_at, event_type, task_id, tasks(title, display_id)")
          .eq("actor_id", userId)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: true })
          .limit(200),
        supabase
          .from("attendance_entries")
          .select("id, check_in, check_out, status, notes")
          .eq("employee_id", userId)
          .eq("entry_date", dayISO)
          .limit(1),
      ]);

      const entries: TimesheetEntry[] = [];
      for (const r of logsRes.data ?? []) {
        const t = (r as { tasks: { title: string; display_id: string | null } | null }).tasks;
        entries.push({
          kind: "time_log",
          id: String(r.id),
          at: String(r.started_at),
          task_id: (r.task_id as string) ?? null,
          task_title: t?.title ?? null,
          task_display_id: t?.display_id ?? null,
          duration_minutes: (r.duration_minutes as number | null) ?? null,
          event_type: null,
          note: (r.note as string | null) ?? null,
          check_in: null,
          check_out: null,
          attendance_status: null,
        });
      }
      for (const r of auditRes.data ?? []) {
        const t = (r as { tasks: { title: string; display_id: string | null } | null }).tasks;
        entries.push({
          kind: "audit",
          id: String(r.id),
          at: String(r.created_at),
          task_id: (r.task_id as string) ?? null,
          task_title: t?.title ?? null,
          task_display_id: t?.display_id ?? null,
          duration_minutes: null,
          event_type: String(r.event_type),
          note: null,
          check_in: null,
          check_out: null,
          attendance_status: null,
        });
      }
      for (const r of attendRes.data ?? []) {
        const checkIn = (r.check_in as string | null) ?? null;
        entries.push({
          kind: "attendance",
          id: String(r.id),
          at: checkIn ?? `${dayISO}T00:00:00`,
          task_id: null,
          task_title: null,
          task_display_id: null,
          duration_minutes: null,
          event_type: null,
          note: (r.notes as string | null) ?? null,
          check_in: checkIn,
          check_out: (r.check_out as string | null) ?? null,
          attendance_status: String(r.status),
        });
      }
      entries.sort((a, b) => a.at.localeCompare(b.at));
      return entries;
    },
    enabled: !!userId && !!dayISO,
  });

// ===== Live Track (Tab 5) =====
export type LiveTrackUser = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  status: string;
  last_seen_at: string;
  running_log: {
    id: string;
    task_id: string;
    task_title: string | null;
    task_display_id: string | null;
    started_at: string;
  } | null;
};

/** Hidden roles: super_admin should not appear in Live Track. */
const LIVE_TRACK_HIDDEN_ROLES = new Set(["super_admin"]);

export const liveTrackQuery = () =>
  queryOptions({
    queryKey: ["global-dashboard", "live-track"],
    queryFn: async (): Promise<LiveTrackUser[]> => {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const [presRes, openRes] = await Promise.all([
        supabase
          .from("chat_presence")
          .select("user_id, status, last_seen_at")
          .gte("last_seen_at", since),
        supabase
          .from("time_logs")
          .select("id, user_id, task_id, started_at, tasks(title, display_id)")
          .is("ended_at", null),
      ]);

      const presence = presRes.data ?? [];
      const openLogs = openRes.data ?? [];

      // Union: presence users + anyone with a running timer (even if not in chat_presence)
      const allUserIds = Array.from(
        new Set([
          ...presence.map((p) => p.user_id as string),
          ...openLogs.map((l) => l.user_id as string),
        ]),
      );
      if (allUserIds.length === 0) return [];

      const [profsRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").in("id", allUserIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", allUserIds),
      ]);

      // Build a set of users to hide based on roles.
      const hidden = new Set<string>();
      for (const r of rolesRes.data ?? []) {
        if (LIVE_TRACK_HIDDEN_ROLES.has(String(r.role))) hidden.add(String(r.user_id));
      }

      const profMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
      for (const p of profsRes.data ?? []) {
        profMap.set(p.id as string, {
          full_name: p.full_name as string | null,
          avatar_url: p.avatar_url as string | null,
        });
      }

      // Presence lookup — keyed by user_id for merging with timer-only users
      const presMap = new Map<string, { status: string; last_seen_at: string }>();
      for (const p of presence) {
        presMap.set(p.user_id as string, {
          status: String(p.status),
          last_seen_at: String(p.last_seen_at),
        });
      }

      const logMap = new Map<string, LiveTrackUser["running_log"]>();
      for (const l of openLogs) {
        const t = (l as { tasks: { title: string; display_id: string | null } | null }).tasks;
        logMap.set(l.user_id as string, {
          id: String(l.id),
          task_id: String(l.task_id),
          task_title: t?.title ?? null,
          task_display_id: t?.display_id ?? null,
          started_at: String(l.started_at),
        });
      }

      return allUserIds
        .filter((uid) => !hidden.has(uid))
        .map((uid) => {
          const prof = profMap.get(uid);
          const pres = presMap.get(uid);
          const log = logMap.get(uid);
          return {
            user_id: uid,
            full_name: prof?.full_name ?? null,
            avatar_url: prof?.avatar_url ?? null,
            // Timer-only users (not in presence) shown as offline
            status: pres?.status ?? "offline",
            last_seen_at: pres?.last_seen_at ?? log?.started_at ?? new Date().toISOString(),
            running_log: log ?? null,
          };
        })
        .sort((a, b) => {
          const ra = a.running_log ? 0 : a.status === "online" ? 1 : 2;
          const rb = b.running_log ? 0 : b.status === "online" ? 1 : 2;
          if (ra !== rb) return ra - rb;
          return (a.full_name ?? "").localeCompare(b.full_name ?? "");
        });
    },
  });
