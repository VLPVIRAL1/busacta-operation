import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AtSign,
  Copy,
  Forward,
  Info,
  ListChecks,
  MessagesSquare,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Reply,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Star,
  Trash2,
  Users,
  X,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { CursorContextMenu, type CursorMenuItem } from "@/components/ui/cursor-context-menu";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";
import { bubbleTime, dayKey, lastSeenLabel } from "@/lib/format/day-divider";
import { MentionTextarea, renderMentioned } from "@/components/ops/mention-textarea";
import {
  notifyMentions,
  recordSeen,
  toggleReaction,
  toggleStar,
  fetchReactions,
  fetchStars,
  fetchSeen,
  type CommScope,
} from "@/lib/ops/comm-extras";
import { useTypingChannel } from "@/lib/ops/comm-realtime";
import { TypingIndicator } from "./typing-indicator";
import { QuickRepliesMenu } from "./quick-replies-menu";
import { ThreadNotificationMenu } from "./thread-notification-menu";
import { DropzoneOverlay } from "./dropzone-overlay";
import { ReadTicks, type DeliveryState } from "./read-ticks";

const EMOJI_QUICK = ["👍", "❤️", "😂", "🎉", "🙏", "👀", "🔥", "✅"];
const EDIT_WINDOW_MIN = 15;
const UNDO_WINDOW_MS = 5000;

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-4">
      <div className="flex-1 h-px bg-border/60" />
      <span className="text-[11px] font-medium text-muted-foreground px-2 py-0.5 rounded-full bg-muted/60 border border-border/60">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}
interface Msg {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  is_pinned?: boolean | null;
  pinned_at?: string | null;
  is_client_visible?: boolean | null;
  reply_to_message_id?: string | null;
}

interface ThreadChatProps {
  scope: "task" | "chat";
  /** taskId when scope=task; chat_threads.id when scope=chat */
  id: string;
  /** "dm" or "group" — only meaningful when scope=chat. */
  chatKind?: "dm" | "group";
  /** Render extra controls in header (e.g. "Open Task" link). */
  headerExtras?: ReactNode;
  /** Hide the surrounding header (used when Task Detail already shows its own). */
  hideHeader?: boolean;
  /** When set, scroll to + flash this message once after first load (deep-link). */
  initialMessageId?: string | null;
  /** Called once the initial jump has been performed, so caller can strip the URL param. */
  onInitialJumpDone?: () => void;
  /**
   * CLIENT PORTAL ONLY. When true, every outgoing message + attachment is
   * forced to `is_client_visible: true` and the Internal/Client toggle is
   * hidden from the composer. Clients cannot send internal messages.
   * Default false (internal employee mode — toggle visible, default OFF).
   */
  lockClientVisible?: boolean;
}

/* ============================================================
   <ThreadChat>
   Single source of truth for chat UI in Communication Hub
   AND Task Detail. Handles DM, Group, and Task scopes.
   ============================================================ */

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
export function ThreadChat(props: ThreadChatProps) {
  const {
    scope,
    id,
    chatKind = "dm",
    hideHeader,
    headerExtras,
    initialMessageId,
    onInitialJumpDone,
    lockClientVisible = false,
  } = props;
  const qc = useQueryClient();
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [body, setBody] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [quote, setQuote] = useState<{ id: string; body: string; authorName: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  // Task only; default OFF for internal users. When `lockClientVisible` is
  // set by the client portal, the value is forced to true at every read site.
  const [clientVisibleState, setClientVisible] = useState(false);
  const clientVisible = lockClientVisible ? true : clientVisibleState;
  const [infoMsg, setInfoMsg] = useState<Msg | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Msg | null>(null);

  /* ---------- DATA ---------- */

  const isTask = scope === "task";
  const tableName: "task_messages" | "chat_messages" = isTask ? "task_messages" : "chat_messages";
  const fkColumn: "task_id" | "thread_id" = isTask ? "task_id" : "thread_id";

  // Thread / task meta
  const metaQ = useQuery({
    queryKey: ["thread-chat-meta", scope, id],
    queryFn: async () => {
      if (scope === "task") {
        const { data } = await supabase
          .from("tasks")
          .select("id,title,client_entities(projects(name,firms(name)))")
          .eq("id", id)
          .single();
        if (!data) return null;
        const entity = (
          data as {
            client_entities?: {
              projects?: { name?: string | null; firms?: { name?: string | null } | null } | null;
            } | null;
          }
        ).client_entities;
        return {
          title: data.title as string,
          subtitle:
            [entity?.projects?.firms?.name, entity?.projects?.name].filter(Boolean).join(" · ") ||
            "Task",
          avatar_url: null as string | null,
          kind: "task" as const,
        };
      }
      const { data } = await supabase
        .from("chat_threads")
        .select("id,kind,name,avatar_url")
        .eq("id", id)
        .single();
      return data
        ? {
            title: (data.name as string | null) ?? "Conversation",
            subtitle: "",
            avatar_url: data.avatar_url as string | null,
            kind: data.kind as "dm" | "group",
          }
        : null;
    },
  });

  // Members / participants for name lookup
  const membersQ = useQuery({
    queryKey: ["thread-chat-members", scope, id],
    queryFn: async () => {
      let ids: string[] = [];
      if (scope === "chat") {
        const { data } = await supabase
          .from("chat_thread_members")
          .select("user_id")
          .eq("thread_id", id);
        ids = (data ?? []).map((m) => m.user_id as string);
      } else {
        const { data: msgs } = await supabase
          .from("task_messages")
          .select("author_id")
          .eq("task_id", id);
        ids = Array.from(new Set((msgs ?? []).map((m) => m.author_id as string)));
        if (user) ids.push(user.id);
      }
      ids = Array.from(new Set(ids));
      if (ids.length === 0) return {} as Record<string, ProfileLite>;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", ids);
      const map: Record<string, ProfileLite> = {};
      for (const p of profs ?? []) map[p.id] = p as ProfileLite;
      return map;
    },
  });

  // Messages
  const msgsQ = useQuery({
    queryKey: ["thread-chat-messages", scope, id],
    queryFn: async () => {
      const cols =
        scope === "task"
          ? "id,author_id,body,created_at,edited_at,is_pinned,pinned_at,is_client_visible,reply_to_message_id"
          : "id,author_id,body,created_at,edited_at,is_pinned,pinned_at,reply_to_message_id";
      const { data } = await supabase
        .from(tableName as never)
        .select(cols)
        .eq(fkColumn as never, id as never)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(500);
      return (data ?? []) as unknown as Msg[];
    },
  });

  // Realtime fan-out (postgres_changes) — messages + reactions on the same channel.
  useRealtimeChannel(`thread-chat-${scope}-${id}`, (channel) =>
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tableName, filter: `${fkColumn}=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["thread-chat-messages", scope, id] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () =>
        qc.invalidateQueries({ queryKey: ["msg-reactions", scope === "task" ? "task" : "chat"] }),
      ),
  );

  // Mark thread read + clear any forced-unread override
  useEffect(() => {
    if (!user) return;
    const run = async () => {
      if (scope === "chat") {
        await supabase
          .from("chat_thread_members")
          .update({ last_read_at: new Date().toISOString() })
          .eq("thread_id", id)
          .eq("user_id", user.id);
      } else {
        await supabase.from("message_reads").upsert(
          {
            user_id: user.id,
            scope: "task",
            scope_id: id,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: "user_id,scope,scope_id" },
        );
      }
      // Clear forced "mark as unread" override so the row no longer shows unread.
      try {
        await (
          supabase as unknown as {
            rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
          }
        ).rpc("clear_unread_override", { _scope: scope, _scope_id: id });
      } catch {
        /* RPC may not exist in older deployments — ignore. */
      }
      qc.invalidateQueries({ queryKey: ["inbox", "summary"] });
    };
    void run();
  }, [scope, id, user, msgsQ.data?.length, qc]);

  // Auto-scroll on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgsQ.data?.length]);

  // Conversation keyboard shortcuts: 9 = page up, 3 = page down.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = scrollRef.current;
      if (!el) return;
      if (e.key === "9") {
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight * 0.85, behavior: "smooth" });
      } else if (e.key === "3") {
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight * 0.85, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Deep-link: jump to a specific message once after first load.
  const initialJumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialMessageId) return;
    if (initialJumpedRef.current === initialMessageId) return;
    const ids = (msgsQ.data ?? []).map((m) => m.id);
    if (!ids.includes(initialMessageId)) return;
    initialJumpedRef.current = initialMessageId;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`msg-${initialMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.setAttribute("data-comm-flash", "true");
        window.setTimeout(() => el.removeAttribute("data-comm-flash"), 1700);
      }
      onInitialJumpDone?.();
    }, 250);
    return () => window.clearTimeout(t);
  }, [initialMessageId, msgsQ.data, onInitialJumpDone]);

  /* ---------- REACTIONS / STARS / SEEN ---------- */

  const msgIds = useMemo(() => (msgsQ.data ?? []).map((m) => m.id), [msgsQ.data]);
  const commScope: CommScope = scope === "task" ? "task" : "chat";

  const reactionsQ = useQuery({
    queryKey: ["msg-reactions", commScope, msgIds.join(",")],
    enabled: msgIds.length > 0,
    queryFn: () => fetchReactions(commScope, msgIds),
  });
  const starsQ = useQuery({
    queryKey: ["msg-stars", commScope, msgIds.join(",")],
    enabled: msgIds.length > 0,
    queryFn: () => fetchStars(commScope, msgIds),
  });
  const seenQ = useQuery({
    queryKey: ["msg-seen", commScope, msgIds.join(",")],
    enabled: msgIds.length > 0,
    queryFn: () => fetchSeen(commScope, msgIds),
  });

  const reactionsByMsg = useMemo(() => {
    const out: Record<string, { emoji: string; count: number; mine: boolean }[]> = {};
    for (const r of reactionsQ.data ?? []) {
      const arr = out[r.message_id] ?? (out[r.message_id] = []);
      const existing = arr.find((a) => a.emoji === r.emoji);
      if (existing) {
        existing.count += 1;
        if (r.user_id === user?.id) existing.mine = true;
      } else {
        arr.push({ emoji: r.emoji, count: 1, mine: r.user_id === user?.id });
      }
    }
    return out;
  }, [reactionsQ.data, user]);

  const seenByMsg = useMemo(() => {
    const out: Record<string, { user_id: string; read_at: string }[]> = {};
    for (const s of seenQ.data ?? []) {
      const arr = out[s.message_id] ?? (out[s.message_id] = []);
      arr.push({ user_id: s.user_id, read_at: s.read_at });
    }
    return out;
  }, [seenQ.data]);

  const invalidateExtras = () => {
    void qc.invalidateQueries({ queryKey: ["msg-reactions", commScope] });
    void qc.invalidateQueries({ queryKey: ["msg-stars", commScope] });
    void qc.invalidateQueries({ queryKey: ["msg-seen", commScope] });
  };

  /* ---------- MUTATIONS ---------- */

  const lastSentRef = useRef<string | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const text = body.trim();
      if (!text) return null;
      const insert =
        scope === "task"
          ? {
              task_id: id,
              author_id: user.id,
              body: text,
              is_client_visible: clientVisible,
              client_msg_id: genId(),
              reply_to_message_id: quote?.id ?? null,
            }
          : {
              thread_id: id,
              author_id: user.id,
              body: text,
              client_msg_id: genId(),
              reply_to_message_id: quote?.id ?? null,
            };
      const { data, error } = await supabase
        .from(tableName as never)
        .insert(insert as never)
        .select("id")
        .single();
      if (error) throw error;
      if (scope === "chat") {
        await supabase
          .from("chat_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", id);
      }
      const newMsgId = (data as { id?: string } | null)?.id ?? undefined;
      await notifyMentions({
        body: text,
        authorId: user.id,
        authorName: user.email ?? "Someone",
        threadId: scope === "chat" ? id : undefined,
        taskId: scope === "task" ? id : undefined,
        messageId: newMsgId,
        url:
          scope === "task"
            ? `/ops/communication?scope=task&id=${id}`
            : `/ops/communication?scope=${chatKind}&id=${id}`,
        title: `New mention in ${metaQ.data?.title ?? "conversation"}`,
        mentionIds,
      });
      return (data as { id?: string } | null)?.id ?? null;
    },
    onSuccess: (newId) => {
      setBody("");
      setMentionIds([]);
      setQuote(null);
      qc.invalidateQueries({ queryKey: ["thread-chat-messages", scope, id] });
      if (newId) {
        lastSentRef.current = newId;
        const sentId = newId;
        toast("Sent", {
          duration: UNDO_WINDOW_MS,
          action: {
            label: "Undo",
            onClick: () => {
              void supabase
                .from(tableName)
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", sentId)
                .then(() =>
                  qc.invalidateQueries({ queryKey: ["thread-chat-messages", scope, id] }),
                );
            },
          },
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePin = useMutation({
    mutationFn: async (m: Msg) => {
      const { error } = await supabase
        .from(tableName)
        .update({
          is_pinned: !m.is_pinned,
          pinned_at: !m.is_pinned ? new Date().toISOString() : null,
        })
        .eq("id", m.id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["thread-chat-messages", scope, id] }),
  });

  const editMsg = useMutation({
    mutationFn: async ({ msgId, text }: { msgId: string; text: string }) => {
      const { error } = await supabase
        .from(tableName)
        .update({ body: text, edited_at: new Date().toISOString() })
        .eq("id", msgId);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["thread-chat-messages", scope, id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMsg = useMutation({
    mutationFn: async (msgId: string) => {
      const { error } = await supabase
        .from(tableName)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", msgId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["thread-chat-messages", scope, id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---------- DERIVED ---------- */

  const allMsgs = msgsQ.data ?? [];
  const msgById = useMemo(() => {
    const m = new Map<string, Msg>();
    for (const x of allMsgs) m.set(x.id, x);
    return m;
  }, [allMsgs]);
  const filteredMsgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allMsgs;
    return allMsgs.filter((m) => m.body.toLowerCase().includes(q));
  }, [allMsgs, search]);
  const pinned = allMsgs.filter((m) => m.is_pinned);
  const memberCount = Object.keys(membersQ.data ?? {}).length;
  const otherDmId =
    scope === "chat" && chatKind === "dm"
      ? (Object.keys(membersQ.data ?? {}).find((k) => k !== user?.id) ?? null)
      : null;
  const dmTitle =
    scope === "chat" && chatKind === "dm" && otherDmId
      ? membersQ.data?.[otherDmId]?.full_name ||
        membersQ.data?.[otherDmId]?.email ||
        "Direct message"
      : null;

  const headerTitle = dmTitle ?? metaQ.data?.title ?? "Conversation";
  const headerSubtitle =
    scope === "task"
      ? (metaQ.data?.subtitle ?? "Task")
      : chatKind === "group"
        ? `${memberCount} members`
        : "Direct message";

  const headerIcon =
    scope === "task" ? (
      <ListChecks className="h-4 w-4" />
    ) : chatKind === "group" ? (
      <Users className="h-4 w-4" />
    ) : (
      <MessagesSquare className="h-4 w-4" />
    );

  /* ---------- HELPERS ---------- */

  const editBlocked = (m: Msg): string | null => {
    if (m.author_id !== user?.id) return "Only the author can edit";
    const ageMin = (Date.now() - new Date(m.created_at).getTime()) / 60000;
    if (ageMin > EDIT_WINDOW_MIN) return `Edit window expired (${EDIT_WINDOW_MIN} min)`;
    return null;
  };

  const jumpToMessage = (msgId: string) => {
    const flash = () => {
      const el = document.getElementById(`msg-${msgId}`);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.setAttribute("data-comm-flash", "true");
      setTimeout(() => el.removeAttribute("data-comm-flash"), 1700);
      return true;
    };
    if (flash()) return;
    setSearch("");
    window.setTimeout(flash, 80);
  };

  const deliveryState = (m: Msg): DeliveryState => {
    const seen = (seenByMsg[m.id] ?? []).filter((s) => s.user_id !== user?.id);
    if (seen.length > 0) return "read";
    // "Delivered" heuristic: at least one other member exists in the chat
    if (memberCount > 1) return "delivered";
    return "sent";
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  /* ---------- MESSAGE CONTEXT MENU ---------- */

  const buildBubbleMenu = (m: Msg): CursorMenuItem[] => {
    const author = membersQ.data?.[m.author_id];
    const isMine = m.author_id === user?.id;
    const editReason = editBlocked(m);
    const isStarred = starsQ.data?.has(m.id) ?? false;
    return [
      {
        label: "Reply",
        icon: <Reply />,
        onSelect: () =>
          setQuote({
            id: m.id,
            body: m.body,
            authorName: author?.full_name || author?.email || "User",
          }),
      },
      { label: "Forward", icon: <Forward />, onSelect: () => setForwardMsg(m) },
      { label: "Copy text", icon: <Copy />, onSelect: () => copyText(m.body) },
      {
        label: isStarred ? "Unstar" : "Star",
        icon: <Star />,
        onSelect: async () => {
          await toggleStar(commScope, m.id);
          invalidateExtras();
        },
      },
      {
        label: m.is_pinned ? "Unpin" : "Pin",
        icon: m.is_pinned ? <PinOff /> : <Pin />,
        onSelect: () => togglePin.mutate(m),
      },
      {
        label: "Message info",
        icon: <Info />,
        onSelect: () => setInfoMsg(m),
        separatorBefore: true,
      },
      ...(isMine
        ? [
            {
              label: "Edit",
              icon: <Pencil />,
              disabled: !!editReason,
              onSelect: () => {
                setEditingId(m.id);
                setEditBody(m.body);
              },
              separatorBefore: true,
            } as CursorMenuItem,
            {
              label: "Delete",
              icon: <Trash2 />,
              destructive: true,
              onSelect: () => {
                if (confirm("Delete this message?")) deleteMsg.mutate(m.id);
              },
            } as CursorMenuItem,
          ]
        : []),
    ];
  };

  /* ---------- RENDER ---------- */

  return (
    <DropzoneOverlay
      scope={scope === "task" ? "task" : "chat"}
      taskId={scope === "task" ? id : undefined}
      threadId={scope === "chat" ? id : undefined}
      clientVisible={scope === "task" ? clientVisible : false}
    >
      {!hideHeader && (
        <ChatHeader
          icon={headerIcon}
          avatar={metaQ.data?.avatar_url ?? null}
          dmUserId={otherDmId}
          title={headerTitle}
          subtitle={headerSubtitle}
          search={search}
          onSearchChange={setSearch}
          right={
            <div className="flex items-center gap-1.5">
              <ThreadNotificationMenu kind={scope === "task" ? "task" : chatKind} threadId={id} />
              {headerExtras}
            </div>
          }
        />
      )}

      {/* Pinned banner */}
      {pinned.length > 0 && (
        <div className="border-b border-amber-300/60 bg-gradient-to-r from-amber-100/70 to-amber-50/40 dark:from-amber-950/40 dark:to-amber-950/10 backdrop-blur-sm px-3 py-2 text-xs space-y-1 shrink-0">
          {pinned.slice(0, 2).map((p) => {
            const a = membersQ.data?.[p.author_id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => jumpToMessage(p.id)}
                className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-amber-200/40 dark:hover:bg-amber-900/30 transition-colors"
              >
                <Pin className="h-3 w-3 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-amber-900 dark:text-amber-200">
                    {a?.full_name || a?.email || "Pinned"}:
                  </span>{" "}
                  <span className="text-amber-900/80 dark:text-amber-100/80">{p.body}</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin.mutate(p);
                  }}
                  aria-label="Unpin"
                  className="rounded p-0.5 text-amber-700 hover:bg-amber-200/60 dark:text-amber-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </button>
            );
          })}
          {pinned.length > 2 && (
            <div className="text-[10px] text-amber-800/70 dark:text-amber-300/70 px-1">
              +{pinned.length - 2} more pinned
            </div>
          )}
        </div>
      )}

      {/* Messages list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
        {filteredMsgs.length === 0 && !msgsQ.isLoading && (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<MessagesSquare className="h-7 w-7" />}
              title={search ? "No matches" : "No messages yet"}
              description={search ? "Try a different keyword" : "Start the conversation below."}
            />
          </div>
        )}
        {filteredMsgs.map((m, idx) => {
          const prev = idx > 0 ? filteredMsgs[idx - 1] : null;
          const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
          const sameAuthor = !!prev && prev.author_id === m.author_id;
          const within5 =
            !!prev &&
            Math.abs(new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) <
              5 * 60_000;
          const grouped = sameAuthor && within5 && !showDay;

          const author = membersQ.data?.[m.author_id];
          const isMine = m.author_id === user?.id;
          const quoted = m.reply_to_message_id ? msgById.get(m.reply_to_message_id) : null;
          const quotedAuthor = quoted ? membersQ.data?.[quoted.author_id] : null;
          const rxns = reactionsByMsg[m.id] ?? [];

          return (
            <div key={m.id} id={`msg-${m.id}`}>
              {showDay && <DateDivider label={dayKey(m.created_at)} />}
              <div
                className={cn(
                  "flex gap-2",
                  isMine ? "flex-row-reverse" : "flex-row",
                  grouped ? "mt-0.5" : "mt-3",
                )}
              >
                {/* Avatar slot — only on first message of a group */}
                <div className="w-8 shrink-0">
                  {!isMine && !grouped && (
                    <UserAvatar profile={author ?? null} size="sm" showPresence />
                  )}
                </div>

                <CursorContextMenu items={() => buildBubbleMenu(m)}>
                  {({ onContextMenu }) => (
                    <div
                      onContextMenu={onContextMenu}
                      className={cn(
                        "group relative max-w-[78%] flex flex-col",
                        isMine ? "items-end" : "items-start",
                        rxns.length > 0 && "mb-3",
                      )}
                    >
                      {!isMine && !grouped && (
                        <div className="text-[11px] font-semibold text-foreground px-1 mb-0.5">
                          {author?.full_name || author?.email || "User"}
                        </div>
                      )}

                      {/* Visibility badge — task scope only. Makes it
                          unambiguous what the client can / cannot see. */}
                      {scope === "task" && (
                        <div
                          className={cn(
                            "mb-0.5 inline-flex items-center gap-1 self-start rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
                            isMine && "self-end",
                            m.is_client_visible
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                              : "bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20",
                          )}
                          aria-label={m.is_client_visible ? "Shared with client" : "Internal only"}
                        >
                          {m.is_client_visible ? (
                            <>
                              <ShieldCheck className="h-2.5 w-2.5" /> Shared
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="h-2.5 w-2.5" /> Internal
                            </>
                          )}
                        </div>
                      )}

                      <div
                        className={cn(
                          "relative rounded-2xl px-3 pt-2 pb-1.5 text-[13px] leading-snug shadow-sm border min-w-[60px] max-w-full",
                          isMine
                            ? "bg-primary text-primary-foreground border-primary/40 rounded-br-sm"
                            : "bg-muted/70 border-border/60 rounded-bl-sm",
                          // Client-visible accent (task only)
                          scope === "task" &&
                            m.is_client_visible &&
                            (isMine
                              ? "ring-2 ring-emerald-400 bg-emerald-600 text-white border-emerald-500"
                              : "border-l-[3px] border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30"),
                        )}
                      >
                        {/* Quoted reply inset */}
                        {quoted && (
                          <button
                            type="button"
                            onClick={() => jumpToMessage(quoted.id)}
                            className={cn(
                              "block w-full text-left rounded-md px-2 py-1 mb-1.5 text-[11px] border-l-2 transition-colors",
                              isMine
                                ? "bg-primary-foreground/15 border-primary-foreground/40 hover:bg-primary-foreground/25"
                                : "bg-background/60 border-primary/60 hover:bg-background/90",
                            )}
                          >
                            <div className="font-semibold opacity-90 truncate">
                              {quotedAuthor?.full_name || quotedAuthor?.email || "Earlier message"}
                            </div>
                            <div className="line-clamp-2 opacity-75">{quoted.body}</div>
                          </button>
                        )}

                        {/* Body / editor */}
                        {editingId === m.id ? (
                          <div className="space-y-2 min-w-[240px]">
                            <MentionTextarea value={editBody} onChange={setEditBody} rows={3} />
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() =>
                                  editMsg.mutate({ msgId: m.id, text: editBody.trim() })
                                }
                                disabled={!editBody.trim() || editMsg.isPending}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap break-words">
                            {renderBody(m.body, search, () => jumpToMessage(m.id))}
                          </div>
                        )}

                        {/* Inline footer: edited · time · ticks (sibling row — never overlaps body) */}
                        <div
                          className={cn(
                            "mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums",
                            isMine ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {m.edited_at && <span className="italic opacity-80">edited</span>}
                          {(starsQ.data?.has(m.id) ?? false) && (
                            <Star
                              className={cn(
                                "h-3 w-3 fill-current",
                                isMine ? "text-amber-200" : "text-amber-500",
                              )}
                            />
                          )}
                          {m.is_pinned && (
                            <Pin
                              className={cn(
                                "h-3 w-3",
                                isMine ? "text-primary-foreground/90" : "text-indigo-500",
                              )}
                            />
                          )}
                          <span>{bubbleTime(m.created_at)}</span>
                          {isMine && <ReadTicks state={deliveryState(m)} />}
                        </div>
                      </div>

                      {/* Reactions floating below bubble */}
                      {rxns.length > 0 && (
                        <div
                          className={cn(
                            "absolute -bottom-2.5 flex gap-0.5",
                            isMine ? "right-2" : "left-2",
                          )}
                        >
                          {rxns.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={async () => {
                                await toggleReaction(commScope, m.id, r.emoji);
                                invalidateExtras();
                              }}
                              className={cn(
                                "inline-flex items-center gap-0.5 rounded-full border bg-background px-1.5 py-0 text-[11px] leading-tight shadow-sm",
                                r.mine
                                  ? "border-primary/40 bg-primary/10 text-primary"
                                  : "border-border hover:bg-accent",
                              )}
                            >
                              <span>{r.emoji}</span>
                              <span className="text-[10px]">{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Hover toolbar (quick react + reply, secondary to context menu) */}
                      <div
                        className={cn(
                          "absolute -top-3 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
                          isMine ? "left-2" : "right-2",
                        )}
                      >
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label="React"
                              className="rounded-full border bg-background p-1 shadow-sm hover:bg-accent"
                            >
                              <Smile className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-1" align={isMine ? "end" : "start"}>
                            <div className="flex gap-0.5">
                              {EMOJI_QUICK.map((e) => (
                                <button
                                  key={e}
                                  type="button"
                                  onClick={async () => {
                                    await toggleReaction(commScope, m.id, e);
                                    invalidateExtras();
                                  }}
                                  className="rounded p-1 text-base hover:bg-accent"
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <button
                          type="button"
                          aria-label="Reply"
                          onClick={() =>
                            setQuote({
                              id: m.id,
                              body: m.body,
                              authorName: author?.full_name || author?.email || "User",
                            })
                          }
                          className="rounded-full border bg-background p-1 shadow-sm hover:bg-accent"
                        >
                          <Reply className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </CursorContextMenu>
                <SeenObserver scope={commScope} messageId={m.id} />
              </div>
            </div>
          );
        })}
      </div>

      <Composer
        scope={scope}
        body={body}
        onChange={setBody}
        onMentionIds={setMentionIds}
        onSend={() => send.mutate()}
        pending={send.isPending}
        quote={quote}
        onClearQuote={() => setQuote(null)}
        clientVisible={clientVisible}
        onClientVisibleChange={setClientVisible}
        lockClientVisible={lockClientVisible}
        typingTopic={`${scope}-${id}`}
      />

      {/* Message Info dialog */}
      <Dialog open={!!infoMsg} onOpenChange={(v) => !v && setInfoMsg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Message info</DialogTitle>
          </DialogHeader>
          {infoMsg && (
            <div className="space-y-3 text-xs">
              <div>
                <div className="text-muted-foreground">Sent</div>
                <div>{new Date(infoMsg.created_at).toLocaleString()}</div>
              </div>
              {infoMsg.edited_at && (
                <div>
                  <div className="text-muted-foreground">Edited</div>
                  <div>{new Date(infoMsg.edited_at).toLocaleString()}</div>
                </div>
              )}
              <div>
                <div className="text-muted-foreground">Read by</div>
                {(seenByMsg[infoMsg.id] ?? []).filter((s) => s.user_id !== user?.id).length ===
                0 ? (
                  <div className="italic text-muted-foreground">No one yet</div>
                ) : (
                  <ul className="space-y-1 mt-1">
                    {(seenByMsg[infoMsg.id] ?? [])
                      .filter((s) => s.user_id !== user?.id)
                      .map((s) => {
                        const p = membersQ.data?.[s.user_id];
                        return (
                          <li key={s.user_id} className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <UserAvatar profile={p ?? null} size="xs" />
                              <span>{p?.full_name || p?.email || s.user_id.slice(0, 8)}</span>
                            </span>
                            <span className="text-muted-foreground">{bubbleTime(s.read_at)}</span>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Forward dialog — stub: copies text + tells user to paste */}
      <Dialog open={!!forwardMsg} onOpenChange={(v) => !v && setForwardMsg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Forward message</DialogTitle>
          </DialogHeader>
          {forwardMsg && (
            <div className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                The message has been copied to your clipboard. Open the destination conversation and
                paste it.
              </p>
              <div className="rounded bg-muted/50 p-2 text-foreground">{forwardMsg.body}</div>
              <Button
                size="sm"
                onClick={() => {
                  copyText(forwardMsg.body);
                  setForwardMsg(null);
                }}
              >
                <Copy className="h-3 w-3 mr-1" /> Copy again
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DropzoneOverlay>
  );
}

/* ============================================================
   Header
   ============================================================ */
function ChatHeader({
  icon,
  avatar,
  dmUserId,
  title,
  subtitle,
  search,
  onSearchChange,
  right,
}: {
  icon: ReactNode;
  avatar: string | null;
  dmUserId: string | null;
  title: string;
  subtitle: string;
  search: string;
  onSearchChange?: (v: string) => void;
  right?: ReactNode;
}) {
  // For DMs, show real-time last-seen.
  const presenceQ = useQuery({
    queryKey: ["presence", dmUserId],
    enabled: !!dmUserId,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!dmUserId) return null;
      const { data } = await supabase
        .from("chat_presence")
        .select("status,last_seen_at")
        .eq("user_id", dmUserId)
        .maybeSingle();
      return data;
    },
  });
  const onlineNow =
    !!presenceQ.data?.last_seen_at &&
    Date.now() - new Date(presenceQ.data.last_seen_at).getTime() < 2 * 60_000 &&
    presenceQ.data.status !== "offline";
  const dmStatus = dmUserId ? lastSeenLabel(presenceQ.data?.last_seen_at, onlineNow) : null;

  return (
    <div className="border-b px-4 py-2.5 flex items-center gap-3 shrink-0">
      <span className="relative inline-flex">
        <Avatar className="h-9 w-9">
          {avatar && <AvatarImage src={avatar} />}
          <AvatarFallback className="bg-primary/10 text-primary">{icon}</AvatarFallback>
        </Avatar>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{title}</div>
        <div className="text-[11px] text-muted-foreground truncate">{dmStatus ?? subtitle}</div>
      </div>
      {onSearchChange && (
        <div className="relative w-44">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search…"
            className="h-7 pl-8 text-xs"
          />
        </div>
      )}
      {right}
    </div>
  );
}

/* ============================================================
   Pill Composer (auto-grow textarea + inline icons)
   ============================================================ */
function Composer(props: {
  scope: "task" | "chat";
  body: string;
  onChange: (v: string) => void;
  onMentionIds?: (ids: string[]) => void;
  onSend: () => void;
  pending: boolean;
  quote: { id: string; body: string; authorName: string } | null;
  onClearQuote: () => void;
  clientVisible: boolean;
  onClientVisibleChange: (v: boolean) => void;
  /** Portal context: hide the Internal/Client toggle entirely. */
  lockClientVisible?: boolean;
  typingTopic: string;
}) {
  const { user } = useAuth();
  const { typers, sendTyping } = useTypingChannel(
    props.typingTopic,
    user?.id ?? null,
    user?.email ?? "Someone",
  );
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const insertText = (text: string) => {
    props.onChange(props.body ? `${props.body}\n${text}` : text);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (props.body.trim() && !props.pending) props.onSend();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (props.body.trim() && !props.pending) props.onSend();
    }
  };

  return (
    <div className="border-t bg-background px-3 pt-2 pb-3 shrink-0 space-y-2">
      <TypingIndicator typers={typers} />
      {props.quote && (
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-xs">
          <Reply className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium text-primary">
              Replying to {props.quote.authorName}
            </div>
            <div className="line-clamp-2 text-muted-foreground">{props.quote.body}</div>
          </div>
          <button
            type="button"
            onClick={props.onClearQuote}
            aria-label="Cancel reply"
            className="rounded p-0.5 hover:bg-background"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Client visibility toggle — task scope only. Hidden in portal
          (lockClientVisible) since clients cannot send internal messages. */}
      {props.scope === "task" && !props.lockClientVisible && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-full border bg-muted/40 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => props.onClientVisibleChange(false)}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors",
                !props.clientVisible
                  ? "bg-background shadow-sm text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ShieldAlert className="h-3 w-3" /> Internal only
            </button>
            <button
              type="button"
              onClick={() => props.onClientVisibleChange(true)}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors",
                props.clientVisible
                  ? "bg-emerald-500 text-white shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ShieldCheck className="h-3 w-3" /> Client visible
            </button>
          </div>
          {props.clientVisible && (
            <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 text-[10px]">
              This message will be visible to the client
            </Badge>
          )}
        </div>
      )}

      {/* Pill composer */}
      <div
        className={cn(
          "flex items-end gap-1 rounded-3xl border bg-background px-2 py-1 transition-colors",
          props.scope === "task" && props.clientVisible
            ? "border-emerald-500 ring-2 ring-emerald-500/30"
            : "border-input focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        )}
        onClick={() => {
          // Focus textarea when clicking anywhere on pill
          const ta = document.getElementById(
            `comp-${props.typingTopic}`,
          ) as HTMLTextAreaElement | null;
          ta?.focus();
        }}
      >
        <div className="flex items-center pb-1.5 pl-1 shrink-0">
          <QuickRepliesMenu onInsert={insertText} />
        </div>

        <MentionTextarea
          id={`comp-${props.typingTopic}`}
          value={props.body}
          onChange={(v) => {
            props.onChange(v);
            if (v.trim().length > 0) sendTyping();
          }}
          onMentionsChange={props.onMentionIds}
          placeholder="Message… (Enter to send, Shift+Enter for newline, @ to mention)"
          onKeyDown={onKey}
          rows={1}
          autoGrow
          menuPlacement="top"
          className="flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm leading-snug shadow-none focus-visible:ring-0 focus-visible:outline-none min-h-[36px] max-h-[140px]"
        />

        <div className="flex items-center gap-0.5 pb-1.5 pr-0.5 shrink-0">
          <button
            type="button"
            title="Mention"
            onClick={() => props.onChange(`${props.body}@`)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <AtSign className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Attach (or drag & drop)"
            onClick={() => fileRef.current?.click()}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;
              // Synthesise a drop event so DropzoneOverlay handles upload uniformly.
              const dt = new DataTransfer();
              for (const f of files) dt.items.add(f);
              const drop = new DragEvent("drop", {
                bubbles: true,
                cancelable: true,
                dataTransfer: dt,
              });
              e.target.closest(".relative")?.dispatchEvent(drop);
              e.target.value = "";
            }}
          />
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Emoji"
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1" align="end">
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJI_QUICK.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      insertText(e);
                      setEmojiOpen(false);
                    }}
                    className="rounded p-1 text-lg hover:bg-accent"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 rounded-full"
            disabled={props.pending || !props.body.trim()}
            onClick={props.onSend}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Body rendering
   ============================================================ */
function renderBody(text: string, q: string, onMentionClick?: (userId: string) => void) {
  if (/@\[[^\]]+\]\([0-9a-f-]{36}\)/.test(text)) {
    return <>{renderMentioned(text, onMentionClick)}</>;
  }
  return highlight(text, q);
}
function highlight(text: string, q: string) {
  const query = q.trim();
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200/80 text-foreground rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/* "Seen" IntersectionObserver — records read receipt the first time
   a message scrolls into view. */
function SeenObserver({ scope, messageId }: { scope: CommScope; messageId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !done) {
            done = true;
            void recordSeen(scope, messageId);
            io.disconnect();
          }
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scope, messageId]);
  return <span ref={ref} aria-hidden className="sr-only" />;
}
