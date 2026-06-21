import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ThreadParticipant = {
  name: string | null;
  address: string;
  role?: "from" | "to" | "cc";
};

export type ThreadListItem = {
  id: string;
  account_id: string;
  subject: string | null;
  snippet: string | null;
  last_message_at: string | null;
  message_count: number;
  unread_count: number;
  has_attachments: boolean;
  is_flagged: boolean;
  folder: string;
  linked_count: number;
  participants: ThreadParticipant[];
};

export type ThreadMessage = {
  id: string;
  provider_message_id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: ThreadParticipant[];
  cc_addresses: ThreadParticipant[];
  sent_at: string | null;
  is_read: boolean;
  is_draft: boolean;
  has_attachments: boolean;
  body_html: string | null;
  body_text: string | null;
};

export type ThreadDetail = {
  thread: ThreadListItem;
  messages: ThreadMessage[];
};

const FOLDERS = ["inbox", "sent", "drafts", "archive", "trash", "spam", "all"] as const;

function asParticipants(value: unknown): ThreadParticipant[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({
      name: typeof v.name === "string" ? v.name : null,
      address: typeof v.address === "string" ? v.address : "",
      role:
        v.role === "from" || v.role === "to" || v.role === "cc"
          ? (v.role as "from" | "to" | "cc")
          : undefined,
    }))
    .filter((p) => !!p.address);
}

export const listThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      accountId: string;
      folder?: (typeof FOLDERS)[number];
      search?: string;
      unreadOnly?: boolean;
      limit?: number;
    }) =>
      z
        .object({
          accountId: z.string().uuid(),
          folder: z.enum(FOLDERS).optional(),
          search: z.string().max(200).optional(),
          unreadOnly: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("tracked_email_threads")
      .select(
        "id, account_id, subject, snippet, last_message_at, message_count, unread_count, has_attachments, is_flagged, folder, linked_count, participants",
      )
      .eq("account_id", data.accountId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(data.limit ?? 100);

    if (data.folder && data.folder !== "all") q = q.eq("folder", data.folder);
    if (data.unreadOnly) q = q.gt("unread_count", 0);
    if (data.search && data.search.trim()) {
      const term = `%${data.search.trim()}%`;
      q = q.or(`subject.ilike.${term},snippet.ilike.${term}`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      ...r,
      participants: asParticipants(r.participants),
    })) as ThreadListItem[];
  });

export const getThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string }) =>
    z.object({ threadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: thread, error: tErr } = await supabase
      .from("tracked_email_threads")
      .select(
        "id, account_id, subject, snippet, last_message_at, message_count, unread_count, has_attachments, is_flagged, folder, linked_count, participants",
      )
      .eq("id", data.threadId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!thread) throw new Error("Thread not found.");

    const { data: messages, error: mErr } = await supabase
      .from("tracked_emails")
      .select(
        "id, provider_message_id, subject, from_address, from_name, to_addresses, cc_addresses, sent_at, is_read, is_draft, has_attachments, body_html, body_text",
      )
      .eq("thread_id", data.threadId)
      .order("sent_at", { ascending: true, nullsFirst: true });
    if (mErr) throw new Error(mErr.message);

    return {
      thread: { ...thread, participants: asParticipants(thread.participants) },
      messages: (messages ?? []).map((m) => ({
        ...m,
        to_addresses: asParticipants(m.to_addresses),
        cc_addresses: asParticipants(m.cc_addresses),
      })),
    } as ThreadDetail;
  });

export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string; isRead: boolean }) =>
    z.object({ threadId: z.string().uuid(), isRead: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error: uErr } = await supabase
      .from("tracked_emails")
      .update({ is_read: data.isRead })
      .eq("thread_id", data.threadId);
    if (uErr) throw new Error(uErr.message);
    const { error: tErr } = await supabase
      .from("tracked_email_threads")
      .update({ unread_count: data.isRead ? 0 : 1 })
      .eq("id", data.threadId);
    if (tErr) throw new Error(tErr.message);
    return { ok: true as const };
  });
