import { supabase } from "@/integrations/supabase/client";

export type CommScope = "task" | "chat";

const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;

export function extractMentionIds(text: string): string[] {
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) ids.add(m[2]);
  return Array.from(ids);
}

export async function toggleReaction(scope: CommScope, messageId: string, emoji: string) {
  const { data, error } = await supabase.rpc("toggle_reaction", {
    _scope: scope,
    _message_id: messageId,
    _emoji: emoji,
  });
  if (error) throw error;
  return data as boolean;
}

export async function toggleStar(scope: CommScope, messageId: string) {
  const { data, error } = await supabase.rpc("toggle_star", {
    _scope: scope,
    _message_id: messageId,
  });
  if (error) throw error;
  return data as boolean;
}

export async function recordSeen(scope: CommScope, messageId: string) {
  await supabase.rpc("record_message_seen", { _scope: scope, _message_id: messageId });
}

export interface ReactionRow {
  message_id: string;
  emoji: string;
  user_id: string;
}
export interface SeenRow {
  message_id: string;
  user_id: string;
  read_at: string;
}

export async function fetchReactions(scope: CommScope, messageIds: string[]) {
  if (messageIds.length === 0) return [] as ReactionRow[];
  const { data } = await supabase
    .from("message_reactions")
    .select("message_id, emoji, user_id")
    .eq("scope", scope)
    .in("message_id", messageIds);
  return (data ?? []) as ReactionRow[];
}

export async function fetchStars(scope: CommScope, messageIds: string[]) {
  if (messageIds.length === 0) return new Set<string>();
  const { data } = await supabase
    .from("message_stars")
    .select("message_id")
    .eq("scope", scope)
    .in("message_id", messageIds);
  return new Set((data ?? []).map((r) => r.message_id as string));
}

export async function fetchSeen(scope: CommScope, messageIds: string[]) {
  if (messageIds.length === 0) return [] as SeenRow[];
  const { data } = await supabase
    .from("message_reads_detail")
    .select("message_id, user_id, read_at")
    .eq("scope", scope)
    .in("message_id", messageIds);
  return (data ?? []) as SeenRow[];
}

/** Insert in-app notifications for each mentioned user (other than self). */
export async function notifyMentions(opts: {
  body: string;
  authorId: string;
  authorName: string;
  taskId?: string;
  threadId?: string;
  messageId?: string;
  url: string;
  title?: string;
  /** Explicit mention IDs — use instead of parsing from body when body uses @name format. */
  mentionIds?: string[];
}) {
  const ids = Array.from(new Set(opts.mentionIds ?? extractMentionIds(opts.body))).filter(
    (id) => id !== opts.authorId,
  );
  if (ids.length === 0) return;
  const url = opts.messageId
    ? `${opts.url}${opts.url.includes("?") ? "&" : "?"}msg=${opts.messageId}`
    : opts.url;
  const rows = ids.map((user_id) => ({
    user_id,
    kind: "mention",
    title: opts.title ?? `${opts.authorName} mentioned you`,
    body: opts.body.replace(MENTION_RE, "@$1").slice(0, 240),
    task_id: opts.taskId ?? null,
    url,
  }));
  await supabase.from("notifications").insert(rows);
}
