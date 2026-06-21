import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { MessagesSquare, Plus, Send, Users, X, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/shared/utils";
import { fmtIST } from "@/lib/format/time";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

type ThreadRow = {
  id: string;
  kind: "dm" | "group";
  name: string | null;
  dm_key: string | null;
  created_by: string;
  updated_at: string;
};
type Member = { thread_id: string; user_id: string; last_read_at: string | null };
type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};
type Message = {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
};

const INTERNAL_ROLES = ["super_admin", "admin", "hr_manager", "employee"] as const;

export function DirectMessagesPage({
  initialCompose = false,
  initialThreadId = null,
}: {
  initialCompose?: boolean;
  initialThreadId?: string | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(initialThreadId);
  const [composeOpen, setComposeOpen] = useState(initialCompose);
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Threads I'm a member of
  const threadsQ = useQuery({
    queryKey: ["dm-threads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: mem, error: e1 } = await supabase
        .from("chat_thread_members")
        .select("thread_id,last_read_at")
        .eq("user_id", user!.id);
      if (e1) throw e1;
      const ids = (mem ?? []).map((m) => m.thread_id);
      if (ids.length === 0) return { threads: [] as ThreadRow[], members: [] as Member[] };
      const { data: threads, error: e2 } = await supabase
        .from("chat_threads")
        .select("id,kind,name,dm_key,created_by,updated_at")
        .in("id", ids)
        .order("updated_at", { ascending: false });
      if (e2) throw e2;
      const { data: members, error: e3 } = await supabase
        .from("chat_thread_members")
        .select("thread_id,user_id,last_read_at")
        .in("thread_id", ids);
      if (e3) throw e3;
      return {
        threads: (threads ?? []) as ThreadRow[],
        members: (members ?? []) as Member[],
      };
    },
  });

  const threads = threadsQ.data?.threads ?? [];
  const allMembers = threadsQ.data?.members ?? [];

  // Resolve all profile ids referenced
  const profileIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of allMembers) s.add(m.user_id);
    return Array.from(s);
  }, [allMembers]);

  const profilesQ = useQuery({
    queryKey: ["dm-profiles", profileIds.join(",")],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email,avatar_url")
        .in("id", profileIds);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profilesQ.data ?? []) m.set(p.id, p);
    return m;
  }, [profilesQ.data]);

  const threadLabel = (t: ThreadRow): string => {
    if (t.kind === "group") return t.name || "Untitled group";
    const others = allMembers
      .filter((m) => m.thread_id === t.id && m.user_id !== user?.id)
      .map((m) => profileMap.get(m.user_id))
      .filter(Boolean) as Profile[];
    return others.map((p) => p.full_name || p.email || "User").join(", ") || "Direct message";
  };

  const threadMembers = (t: ThreadRow): Profile[] =>
    allMembers
      .filter((m) => m.thread_id === t.id)
      .map((m) => profileMap.get(m.user_id))
      .filter(Boolean) as Profile[];

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  // Messages for active
  const messagesQ = useQuery({
    queryKey: ["dm-messages", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id,thread_id,author_id,body,created_at,deleted_at")
        .eq("thread_id", activeId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  // Realtime
  useRealtimeChannel(activeId ? `dm-${activeId}` : null, (channel) =>
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_messages", filter: `thread_id=eq.${activeId}` },
      () => qc.invalidateQueries({ queryKey: ["dm-messages", activeId] }),
    ),
  );

  // Mark read
  useEffect(() => {
    if (!activeId || !user) return;
    supabase
      .from("chat_thread_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", activeId)
      .eq("user_id", user.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["dm-threads", user.id] });
      });
  }, [activeId, user, qc, messagesQ.data?.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messagesQ.data?.length]);

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!activeId) throw new Error("No conversation selected");
      const text = body.trim();
      if (!text) throw new Error("Empty message");
      const { error } = await supabase.from("chat_messages").insert({
        thread_id: activeId,
        author_id: user.id,
        body: text,
      });
      if (error) throw error;
      // bump thread updated_at
      await supabase
        .from("chat_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeId);
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["dm-messages", activeId] });
      qc.invalidateQueries({ queryKey: ["dm-threads", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="lg:h-[calc(100vh-220px)]">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessagesSquare className="h-4 w-4" /> Direct Messages
          </CardTitle>
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="lg:h-[calc(100vh-300px)]">
            {threadsQ.isLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No conversations yet. Start one with a teammate.
              </div>
            ) : (
              <ul className="divide-y">
                {threads.map((t) => {
                  const label = threadLabel(t);
                  const members = threadMembers(t);
                  const myMem = allMembers.find(
                    (m) => m.thread_id === t.id && m.user_id === user?.id,
                  );
                  const isActive = activeId === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveId(t.id);
                          navigate({
                            to: "/ops/communication/dm",
                            search: { thread: t.id } as any,
                          });
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-center gap-2",
                          isActive && "bg-muted",
                        )}
                      >
                        {t.kind === "group" ? (
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                        ) : (
                          <UserAvatar
                            profile={members.find((p) => p.id !== user?.id) ?? null}
                            className="h-8 w-8"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{label}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {t.kind === "group" ? `${members.length} members` : "Direct message"} ·{" "}
                            {fmtIST(t.updated_at)}
                          </div>
                        </div>
                        {myMem?.last_read_at &&
                          new Date(t.updated_at) > new Date(myMem.last_read_at) && (
                            <Badge variant="default" className="h-5 px-1.5">
                              new
                            </Badge>
                          )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="lg:h-[calc(100vh-220px)] flex flex-col">
        {!activeThread ? (
          <CardContent className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<MessagesSquare className="h-8 w-8" />}
              title="Pick a conversation"
              description="Select a thread on the left or start a new one."
              action={
                <Button onClick={() => setComposeOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> New conversation
                </Button>
              }
            />
          </CardContent>
        ) : (
          <>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                {activeThread.kind === "group" ? (
                  <Users className="h-4 w-4" />
                ) : (
                  <MessagesSquare className="h-4 w-4" />
                )}
                {threadLabel(activeThread)}
              </CardTitle>
              <div className="text-[11px] text-muted-foreground">
                {threadMembers(activeThread)
                  .map((p) => p.full_name || p.email)
                  .join(" · ")}
              </div>
            </CardHeader>
            <ScrollArea className="flex-1" ref={scrollRef as any}>
              <div className="p-4 space-y-3">
                {(messagesQ.data ?? []).map((m) => {
                  const author = profileMap.get(m.author_id);
                  const mine = m.author_id === user?.id;
                  return (
                    <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                      <UserAvatar profile={author ?? null} className="h-7 w-7 flex-shrink-0" />
                      <div
                        className={cn(
                          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                          mine ? "bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        {!mine && (
                          <div className="text-[10px] font-medium opacity-80 mb-0.5">
                            {author?.full_name || author?.email}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div
                          className={cn(
                            "text-[10px] mt-1",
                            mine ? "opacity-80" : "text-muted-foreground",
                          )}
                        >
                          {fmtIST(m.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(messagesQ.data ?? []).length === 0 && !messagesQ.isLoading && (
                  <div className="text-center text-xs text-muted-foreground py-6">
                    No messages yet — say hello.
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="border-t p-3 space-y-2">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a message…"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    send.mutate();
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-muted-foreground">
                  Cmd/Ctrl + Enter to send · Internal only — no client visibility
                </div>
                <Button
                  size="sm"
                  disabled={send.isPending || !body.trim()}
                  onClick={() => send.mutate()}
                >
                  <Send className="h-4 w-4 mr-1" /> Send
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={(v) => {
          setComposeOpen(v);
          if (!v && initialCompose) navigate({ to: "/ops/communication/dm" });
        }}
        currentUserId={user?.id ?? null}
        onCreated={(threadId) => {
          setComposeOpen(false);
          setActiveId(threadId);
          qc.invalidateQueries({ queryKey: ["dm-threads", user?.id] });
          navigate({ to: "/ops/communication/dm", search: { thread: threadId } as any });
        }}
      />
    </div>
  );
}

export function ComposeDialog({
  open,
  onOpenChange,
  currentUserId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUserId: string | null;
  onCreated: (threadId: string) => void;
}) {
  const [tab, setTab] = useState<"dm" | "group">("dm");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setGroupName("");
      setSearch("");
      setTab("dm");
    }
  }, [open]);

  const directoryQ = useQuery({
    queryKey: ["dm-directory"],
    enabled: open,
    queryFn: async () => {
      // Internal users only — join profiles with user_roles to filter.
      const { data: roles, error: e1 } = await supabase
        .from("user_roles")
        .select("user_id,role")
        .in(
          "role",
          INTERNAL_ROLES as unknown as ("super_admin" | "admin" | "hr_manager" | "employee")[],
        );
      if (e1) throw e1;
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id))).filter(
        (id) => id !== currentUserId,
      );
      if (ids.length === 0) return [] as Profile[];
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email,avatar_url")
        .in("id", ids)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = directoryQ.data ?? [];
    if (!q) return list;
    return list.filter(
      (p) =>
        (p.full_name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q),
    );
  }, [directoryQ.data, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (tab === "dm") next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const create = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!currentUserId) throw new Error("Not signed in");
      const ids = Array.from(selected);
      if (ids.length === 0) throw new Error("Select at least one teammate");
      if (tab === "group" && !groupName.trim()) throw new Error("Name your group chat");

      if (tab === "dm") {
        const otherId = ids[0];
        const { data, error } = await supabase.rpc("create_chat_thread", {
          _kind: "dm",
          _member_ids: [otherId],
        });
        if (error) throw error;
        return data as string;
      }

      // Group
      const { data, error } = await supabase.rpc("create_chat_thread", {
        _kind: "group",
        _member_ids: ids,
        _name: groupName.trim(),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (threadId) => onCreated(threadId),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as "dm" | "group");
            setSelected(new Set());
          }}
        >
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="dm">Direct message</TabsTrigger>
            <TabsTrigger value="group">Group chat</TabsTrigger>
          </TabsList>
          <TabsContent value="group" className="space-y-2 pt-3">
            <Label>Group name</Label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Tax Team Q3"
            />
          </TabsContent>
          <TabsContent value="dm" className="pt-3">
            <p className="text-xs text-muted-foreground">Pick a teammate to start a 1-to-1 chat.</p>
          </TabsContent>
        </Tabs>
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teammates…"
              className="pl-8"
            />
          </div>
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {Array.from(selected).map((id) => {
                const p = (directoryQ.data ?? []).find((x) => x.id === id);
                return (
                  <Badge key={id} variant="secondary" className="gap-1">
                    {p?.full_name || p?.email}
                    <button onClick={() => toggle(id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          <ScrollArea className="h-64 rounded border">
            {directoryQ.isLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No teammates match.</div>
            ) : (
              <ul className="divide-y">
                {filtered.map((p) => {
                  const checked = selected.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => toggle(p.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2",
                          checked && "bg-muted",
                        )}
                      >
                        <UserAvatar profile={p} className="h-7 w-7" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {p.full_name || p.email}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {p.email}
                          </div>
                        </div>
                        {checked && <Badge variant="default">Selected</Badge>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              create.isPending || selected.size === 0 || (tab === "group" && !groupName.trim())
            }
            onClick={() => create.mutate()}
          >
            {tab === "dm" ? "Start chat" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
