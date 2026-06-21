/**
 * Unified Communication Hub data layer.
 *
 * Aggregates Direct messages, Group chats, and Task chats into a single
 * normalized list for the Unified Inbox. All queries are scoped to the
 * current authenticated user; RLS handles permission enforcement.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { toast } from "sonner";

export type InboxKind = "dm" | "group" | "task";

export interface InboxRow {
  key: string; // `${kind}:${id}`
  kind: InboxKind;
  id: string; // thread_id (dm/group) or task_id
  title: string;
  subtitle: string;
  avatarUrl: string | null;
  avatarUserId: string | null; // for DMs, the other participant
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: number;
  createdAt: string;
  taskId?: string;
  firmId: string | null;
  firmName: string | null;
  pipelineStage: string | null;
  assigneeId: string | null;
  reviewerId: string | null;
  archived: boolean;
  archivedAt: string | null;
  archivedAuto: boolean;
  snoozedUntil: string | null;
  notificationLevel: "all" | "mentions" | "muted";
}

export type InboxScope = "mine" | "all";

interface InboxSummaryRow {
  kind: InboxKind;
  id: string;
  title: string;
  subtitle: string;
  avatar_url: string | null;
  avatar_user_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread: number;
  created_at: string;
  firm_id: string | null;
  firm_name: string | null;
  pipeline_stage: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  archived: boolean;
  archived_at: string | null;
  archived_auto: boolean;
  snoozed_until: string | null;
  notification_level: "all" | "mentions" | "muted";
}

export function useInboxData(scope: InboxScope = "mine") {
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const summary = useQuery({
    queryKey: ["inbox", "summary", uid, scope],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async (): Promise<InboxRow[]> => {
      const { data, error } = await supabase.rpc("inbox_summary", { _scope: scope });
      if (error) throw error;
      const rows = (data ?? []) as InboxSummaryRow[];
      return rows.map((r) => ({
        key: `${r.kind}:${r.id}`,
        kind: r.kind,
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        avatarUrl: r.avatar_url,
        avatarUserId: r.avatar_user_id,
        lastMessageAt: r.last_message_at,
        lastMessagePreview: r.last_message_preview,
        unread: r.unread ?? 0,
        createdAt: r.created_at,
        taskId: r.kind === "task" ? r.id : undefined,
        firmId: r.firm_id,
        firmName: r.firm_name,
        pipelineStage: r.pipeline_stage,
        assigneeId: r.assignee_id,
        reviewerId: r.reviewer_id,
        archived: r.archived,
        archivedAt: r.archived_at,
        archivedAuto: r.archived_auto,
        snoozedUntil: r.snoozed_until,
        notificationLevel: r.notification_level ?? "all",
      }));
    },
  });

  // DM partner profiles for the conversation pane (cheap; only summary already
  // gave us their names + avatars, but the pane sometimes needs more).
  const dmUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of summary.data ?? []) if (r.avatarUserId) s.add(r.avatarUserId);
    return Array.from(s);
  }, [summary.data]);
  const profiles = useQuery({
    queryKey: ["inbox", "profiles", dmUserIds.join(",")],
    enabled: dmUserIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,avatar_url")
        .in("id", dmUserIds);
      const map: Record<
        string,
        { id: string; full_name: string | null; email: string | null; avatar_url: string | null }
      > = {};
      for (const p of data ?? []) map[p.id] = p;
      return map;
    },
  });

  return {
    rows: summary.data ?? [],
    loading: summary.isLoading,
    profilesById: profiles.data ?? {},
  };
}

export interface InboxAggregates {
  totalUnread: number;
  dmUnread: number;
  groupUnread: number;
  taskUnread: number;
  lastActivityAt: string | null;
}

export function useInboxAggregates(rows: InboxRow[]): InboxAggregates {
  return useMemo(() => {
    let totalUnread = 0;
    let dmUnread = 0;
    let groupUnread = 0;
    let taskUnread = 0;
    let lastActivityAt: string | null = null;
    for (const r of rows) {
      if (r.archived) continue;
      if (r.unread > 0) {
        totalUnread += r.unread;
        if (r.kind === "dm") dmUnread += r.unread;
        else if (r.kind === "group") groupUnread += r.unread;
        else taskUnread += r.unread;
      }
      if (r.lastMessageAt && (!lastActivityAt || r.lastMessageAt > lastActivityAt)) {
        lastActivityAt = r.lastMessageAt;
      }
    }
    return { totalUnread, dmUnread, groupUnread, taskUnread, lastActivityAt };
  }, [rows]);
}

export function useToggleArchive() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { kind: InboxKind; targetId: string }) => {
      const { data, error } = await supabase.rpc("toggle_chat_archive", {
        _kind: args.kind,
        _target_id: args.targetId,
      });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: (archived) => {
      toast.success(archived ? "Chat archived" : "Chat restored");
      qc.invalidateQueries({ queryKey: ["inbox", "archives", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRestoreAllArchives() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("restore_all_chat_archives");
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (n) => {
      toast.success(n > 0 ? `Restored ${n} chat${n === 1 ? "" : "s"}` : "Nothing to restore");
      qc.invalidateQueries({ queryKey: ["inbox", "archives", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface CommPrefs {
  comm_auto_archive_enabled: boolean;
  comm_auto_archive_days: number;
}
export function useCommPrefs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["comm-prefs", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<CommPrefs> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("comm_auto_archive_enabled,comm_auto_archive_days")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data as CommPrefs;
    },
  });
  const save = useMutation({
    mutationFn: async (prefs: Partial<CommPrefs>) => {
      const { error } = await supabase.from("profiles").update(prefs).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferences saved");
      qc.invalidateQueries({ queryKey: ["comm-prefs", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { ...query, save };
}

/* ---------------- Phase 3 mutations ---------------- */

function snoozeScope(kind: InboxKind): "task" | "dm" | "group" {
  return kind;
}
function prefScope(kind: InboxKind): "task" | "dm" | "group" {
  return kind;
}
function overrideScope(kind: InboxKind): "task" | "dm" | "group" {
  return kind;
}

export type SnoozePreset = "1h" | "3h" | "tomorrow" | "next_week";

function snoozeUntil(p: SnoozePreset): string {
  const d = new Date();
  if (p === "1h") d.setHours(d.getHours() + 1);
  else if (p === "3h") d.setHours(d.getHours() + 3);
  else if (p === "tomorrow") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else {
    const day = d.getDay();
    const delta = (1 - day + 7) % 7 || 7; // next Monday
    d.setDate(d.getDate() + delta);
    d.setHours(9, 0, 0, 0);
  }
  return d.toISOString();
}

export function useSnoozeThread() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: {
      kind: InboxKind;
      targetId: string;
      preset?: SnoozePreset;
      until?: string | null;
    }) => {
      if (args.until === null) {
        const { error } = await supabase.rpc("unsnooze_thread", {
          _scope: snoozeScope(args.kind),
          _target_id: args.targetId,
        });
        if (error) throw error;
        return;
      }
      const until = args.until ?? snoozeUntil(args.preset ?? "1h");
      const { error } = await supabase.rpc("snooze_thread", {
        _scope: snoozeScope(args.kind),
        _target_id: args.targetId,
        _until: until,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.until === null ? "Unsnoozed" : "Snoozed");
      qc.invalidateQueries({ queryKey: ["inbox", "summary", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export type NotifLevel = "all" | "mentions" | "muted";

export function useSetNotificationPref() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { kind: InboxKind; targetId: string; level: NotifLevel }) => {
      const { error } = await supabase.rpc("set_notification_pref", {
        _scope: prefScope(args.kind),
        _target_id: args.targetId,
        _level: args.level,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(
        vars.level === "muted"
          ? "Muted"
          : vars.level === "mentions"
            ? "Mentions only"
            : "All notifications",
      );
      qc.invalidateQueries({ queryKey: ["inbox", "summary", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useMarkUnread() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { kind: InboxKind; targetId: string; unread: boolean }) => {
      const fn = args.unread ? "mark_unread" : "clear_unread_override";
      const { error } = await supabase.rpc(fn, {
        _scope: overrideScope(args.kind),
        _target_id: args.targetId,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.unread ? "Marked unread" : "Marked read");
      qc.invalidateQueries({ queryKey: ["inbox", "summary", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
