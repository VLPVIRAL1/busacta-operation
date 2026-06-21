import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ExternalLink,
  Eye,
  EyeOff,
  FolderKanban,
  ListChecks,
  MessagesSquare,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MentionTextarea, renderMentioned } from "@/components/ops/mention-textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { UserAvatar } from "@/components/shared/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { fmtIST } from "@/lib/format/time";
import { cn } from "@/lib/shared/utils";

type FirmCommSearch = { scope?: "firm" | "project" | "task"; id?: string };

export const Route = createFileRoute("/ops/firms/$firmId/communication")({
  validateSearch: (search: Record<string, unknown>): FirmCommSearch => {
    const scope = search.scope;
    const id = search.id;
    return {
      scope: scope === "firm" || scope === "project" || scope === "task" ? scope : undefined,
      id: typeof id === "string" ? id : undefined,
    };
  },
  component: FirmCommunicationPage,
  errorComponent: RouteErrorComponent,
});

type FirmMessage = {
  id: string;
  firm_id: string;
  author_id: string;
  body: string;
  is_client_visible: boolean;
  created_at: string;
};

type TaskMessage = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  is_client_visible: boolean;
  created_at: string;
  deleted_at: string | null;
};

type TaskNav = {
  id: string;
  title: string;
  project_id: string | null;
  project_name: string | null;
  pipeline_stage: string | null;
};
type ProjectNav = { id: string; name: string; slug: string | null; tasks: TaskNav[] };
type ReadRow = { scope: "firm" | "task"; scope_id: string; last_read_at: string };

type Selection = { kind: "firm" } | { kind: "project"; id: string } | { kind: "task"; id: string };

function FirmCommunicationPage() {
  const { firmId } = Route.useParams();
  const { user, role } = useAuth();
  const isInternal = role === "admin" || role === "employee";
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const selected: Selection = useMemo(() => {
    if (search.scope === "project" && search.id) return { kind: "project", id: search.id };
    if (search.scope === "task" && search.id) return { kind: "task", id: search.id };
    return { kind: "firm" };
  }, [search.scope, search.id]);
  const setSelected = (sel: Selection) => {
    navigate({
      params: { firmId },
      search: sel.kind === "firm" ? {} : { scope: sel.kind, id: sel.id },
      replace: false,
    });
  };
  const [filterMessages, setFilterMessages] = useState<"all" | "with" | "without">("with");
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(true);
  const [filterStage, setFilterStage] = useState<string>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["firm-communication-projects", firmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, slug, firm_id")
        .eq("firm_id", firmId)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        slug: (p as { slug: string | null }).slug,
        tasks: [] as TaskNav[],
      })) as ProjectNav[];
    },
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["firm-communication-tasks", firmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, pipeline_stage, client_entities!inner(project_id, projects!inner(id, name, firm_id))",
        )
        .eq("client_entities.projects.firm_id", firmId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((t) => {
        const entity = (
          t as {
            client_entities?: {
              project_id?: string | null;
              projects?: { id?: string; name?: string } | null;
            } | null;
          }
        ).client_entities;
        return {
          id: t.id,
          title: t.title,
          project_id: entity?.project_id ?? entity?.projects?.id ?? null,
          project_name: entity?.projects?.name ?? null,
          pipeline_stage: (t as { pipeline_stage?: string | null }).pipeline_stage ?? null,
        };
      }) as TaskNav[];
    },
  });

  const reads = useQuery({
    queryKey: ["msg-reads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("message_reads")
        .select("scope, scope_id, last_read_at")
        .eq("user_id", user!.id);
      return ((data ?? []) as ReadRow[]).reduce<Record<string, string>>((acc, r) => {
        acc[`${r.scope}:${r.scope_id}`] = r.last_read_at;
        return acc;
      }, {});
    },
  });

  const { data: firmMessages, isLoading: firmMessagesLoading } = useQuery({
    queryKey: ["firm-messages", firmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_messages")
        .select("id, firm_id, author_id, body, is_client_visible, created_at")
        .eq("firm_id", firmId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as FirmMessage[];
    },
  });

  const taskIds = useMemo(() => (tasks ?? []).map((t) => t.id), [tasks]);
  const { data: taskMessages, isLoading: taskMessagesLoading } = useQuery({
    queryKey: ["firm-task-messages", firmId, taskIds.join(",")],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_messages")
        .select("id, task_id, author_id, body, is_client_visible, created_at, deleted_at")
        .in("task_id", taskIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as TaskMessage[];
    },
  });

  const taskById = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);

  const allAuthorIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of taskMessages ?? []) set.add(m.author_id);
    for (const m of firmMessages ?? []) set.add(m.author_id);
    return Array.from(set);
  }, [taskMessages, firmMessages]);
  const authorsQuery = useQuery({
    queryKey: ["firm-comm-authors", allAuthorIds.join(",")],
    enabled: allAuthorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", allAuthorIds);
      const map: Record<string, { full_name: string | null; email: string | null }> = {};
      for (const p of data ?? [])
        map[p.id] = { full_name: p.full_name ?? null, email: p.email ?? null };
      return map;
    },
  });
  const authors = authorsQuery.data ?? {};

  const taskMessageCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of taskMessages ?? []) map.set(m.task_id, (map.get(m.task_id) ?? 0) + 1);
    return map;
  }, [taskMessages]);

  const unreadByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of taskMessages ?? []) {
      const lastRead = reads.data?.[`task:${m.task_id}`];
      const isUnread =
        !!user &&
        m.author_id !== user.id &&
        (!lastRead || new Date(m.created_at) > new Date(lastRead));
      if (isUnread) map.set(m.task_id, (map.get(m.task_id) ?? 0) + 1);
    }
    return map;
  }, [taskMessages, reads.data, user]);

  const stages = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks ?? []) if (t.pipeline_stage) set.add(t.pipeline_stage);
    return Array.from(set).sort();
  }, [tasks]);

  const navProjects = useMemo(() => {
    const byProject = new Map(
      (projects ?? []).map((p) => [p.id, { ...p, tasks: [] as TaskNav[] }]),
    );
    for (const task of tasks ?? []) {
      if (!task.project_id || !byProject.has(task.project_id)) continue;
      const count = taskMessageCount.get(task.id) ?? 0;
      const unread = unreadByTask.get(task.id) ?? 0;
      if (filterMessages === "with" && count === 0) continue;
      if (filterMessages === "without" && count > 0) continue;
      if (filterUnreadOnly && unread === 0) continue;
      if (filterStage !== "all" && task.pipeline_stage !== filterStage) continue;
      byProject.get(task.project_id)!.tasks.push(task);
    }
    return Array.from(byProject.values()).filter((p) => p.tasks.length > 0);
  }, [
    projects,
    tasks,
    taskMessageCount,
    unreadByTask,
    filterMessages,
    filterUnreadOnly,
    filterStage,
  ]);

  const stream = useMemo(() => {
    if (selected.kind === "firm") {
      return (firmMessages ?? []).map((m) => ({
        id: `firm:${m.id}`,
        scope: "firm" as const,
        authorId: m.author_id,
        title: "Firm conversation",
        body: m.body,
        createdAt: m.created_at,
        clientVisible: m.is_client_visible,
        taskId: null as string | null,
      }));
    }
    const matches = (m: TaskMessage) => {
      if (selected.kind === "task") return m.task_id === selected.id;
      const t = taskById.get(m.task_id);
      return t?.project_id === selected.id;
    };
    return (taskMessages ?? []).filter(matches).map((m) => {
      const t = taskById.get(m.task_id);
      return {
        id: `task:${m.id}`,
        scope: "task" as const,
        authorId: m.author_id,
        title: t?.title ?? "Task discussion",
        body: m.body,
        createdAt: m.created_at,
        clientVisible: m.is_client_visible,
        taskId: m.task_id,
      };
    });
  }, [selected, firmMessages, taskMessages, taskById]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [stream]);

  useRealtimeChannel(`firm-communication-${firmId}`, (channel) =>
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "firm_messages", filter: `firm_id=eq.${firmId}` },
        () => qc.invalidateQueries({ queryKey: ["firm-messages", firmId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "task_messages" }, () =>
        qc.invalidateQueries({ queryKey: ["firm-task-messages", firmId] }),
      ),
  );

  const markRead = useMutation({
    mutationFn: async (v: { scope: "firm" | "task"; scope_id: string }) => {
      if (!user) return;
      await supabase.from("message_reads").upsert(
        {
          user_id: user.id,
          scope: v.scope,
          scope_id: v.scope_id,
          last_read_at: new Date().toISOString(),
        } as never,
        { onConflict: "user_id,scope,scope_id" },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["msg-reads", user?.id] }),
  });

  useEffect(() => {
    if (selected.kind === "firm") markRead.mutate({ scope: "firm", scope_id: firmId });
    else if (selected.kind === "task") markRead.mutate({ scope: "task", scope_id: selected.id });
    else if (selected.kind === "project") {
      const p = navProjects.find((x) => x.id === selected.id);
      p?.tasks.forEach((t) => markRead.mutate({ scope: "task", scope_id: t.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, navProjects, firmId]);

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (selected.kind === "project")
        throw new Error("Pick a specific task to reply, or switch to firm conversation");
      if (!body.trim()) throw new Error("Empty message");
      const visibility = isInternal ? !internal : true;

      if (selected.kind === "task") {
        const { error } = await supabase.from("task_messages").insert({
          task_id: selected.id,
          author_id: user.id,
          body: body.trim(),
          is_client_visible: visibility,
        });
        if (error) throw error;
        if (mentions.length) {
          await supabase.from("notifications").insert(
            mentions.map((uid) => ({
              user_id: uid,
              kind: "mention",
              title: "You were mentioned in a task",
              body: body.trim().slice(0, 140),
              firm_id: firmId,
              task_id: selected.id,
              url: `/ops/tasks/${selected.id}`,
            })),
          );
        }
      } else {
        // firm or project → post to firm conversation
        const { error } = await supabase.from("firm_messages").insert({
          firm_id: firmId,
          author_id: user.id,
          body: body.trim(),
          is_client_visible: visibility,
        });
        if (error) throw error;
        if (mentions.length) {
          await supabase.from("notifications").insert(
            mentions.map((uid) => ({
              user_id: uid,
              kind: "mention",
              title: "You were mentioned in firm chat",
              body: body.trim().slice(0, 140),
              firm_id: firmId,
              url: `/ops/firms/${firmId}/communication`,
            })),
          );
        }
      }
    },
    onSuccess: () => {
      setBody("");
      setMentions([]);
      qc.invalidateQueries({ queryKey: ["firm-messages", firmId] });
      qc.invalidateQueries({ queryKey: ["firm-task-messages", firmId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = projectsLoading || tasksLoading || firmMessagesLoading || taskMessagesLoading;

  const selectedTitle = useMemo(() => {
    if (selected.kind === "firm") return "Firm conversation";
    if (selected.kind === "project") {
      return navProjects.find((p) => p.id === selected.id)?.name ?? "Project";
    }
    return taskById.get(selected.id)?.title ?? "Task";
  }, [selected, navProjects, taskById]);

  const composerPlaceholder =
    selected.kind === "task"
      ? "Reply on this task… use @ to mention"
      : "Write a firm message… use @ to mention";

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="h-[75vh] overflow-hidden">
        <CardContent className="p-0 h-full flex flex-col">
          <div className="border-b px-4 py-3 flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Projects & tasks</h2>
          </div>
          <div className="border-b px-3 py-2 space-y-2 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={filterMessages}
                onValueChange={(v) => setFilterMessages(v as "all" | "with" | "without")}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tasks</SelectItem>
                  <SelectItem value="with">With messages</SelectItem>
                  <SelectItem value="without">Without messages</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any stage</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="unread-only"
                checked={filterUnreadOnly}
                onCheckedChange={setFilterUnreadOnly}
              />
              <Label htmlFor="unread-only" className="text-xs cursor-pointer">
                Unread only
              </Label>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <button
              type="button"
              onClick={() => setSelected({ kind: "firm" })}
              className={cn(
                "w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted",
                selected.kind === "firm" && "bg-primary/10 text-primary",
              )}
            >
              <Building2 className="h-3.5 w-3.5" />
              Firm conversation
            </button>
            {loading ? (
              <Skeleton className="h-32" />
            ) : navProjects.length === 0 ? (
              <EmptyState
                title="No project tasks"
                description="Tasks under this firm will appear here."
              />
            ) : (
              navProjects.map((project) => (
                <div key={project.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setSelected({ kind: "project", id: project.id })}
                    className={cn(
                      "w-full text-left flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium hover:bg-muted",
                      selected.kind === "project" &&
                        selected.id === project.id &&
                        "bg-primary/10 text-primary",
                    )}
                  >
                    <FolderKanban className="h-3.5 w-3.5" />
                    <span className="truncate">{project.name}</span>
                  </button>
                  <div className="ml-5 space-y-0.5">
                    {project.tasks.map((task) => {
                      const active = selected.kind === "task" && selected.id === task.id;
                      const unread = unreadByTask.get(task.id) ?? 0;
                      const count = taskMessageCount.get(task.id) ?? 0;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setSelected({ kind: "task", id: task.id })}
                          className={cn(
                            "w-full text-left flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted",
                            active ? "bg-primary/10 text-primary" : "text-muted-foreground",
                          )}
                        >
                          <ListChecks className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate flex-1">{task.title}</span>
                          {count > 0 && unread === 0 && (
                            <span className="text-[10px] opacity-60">{count}</span>
                          )}
                          {unread > 0 && <Badge className="h-4 px-1.5 text-[10px]">{unread}</Badge>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass border-border-subtle h-[75vh] overflow-hidden">
        <CardContent className="p-0 flex flex-col h-full">
          <div className="px-5 py-3 border-b flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold truncate">{selectedTitle}</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {stream.length} messages
            </Badge>
            {selected.kind === "task" && (
              <Button asChild size="sm" variant="outline" className="ml-2 h-7 text-xs">
                <Link to="/ops/tasks/$taskId" params={{ taskId: selected.id }}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open task
                </Link>
              </Button>
            )}
            {selected.kind === "project" &&
              (() => {
                const projectSlug = navProjects.find((p) => p.id === selected.id)?.slug;
                if (!projectSlug) return null;
                return (
                  <Button asChild size="sm" variant="outline" className="ml-2 h-7 text-xs">
                    <Link to="/projects/$projectSlug" params={{ projectSlug }}>
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open project
                    </Link>
                  </Button>
                );
              })()}
            {selected.kind === "firm" && (
              <Button asChild size="sm" variant="outline" className="ml-2 h-7 text-xs">
                <Link to="/ops/firms/$firmId" params={{ firmId }}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open firm
                </Link>
              </Button>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : stream.length === 0 ? (
              <EmptyState
                icon={<MessagesSquare className="h-8 w-8" />}
                title="No messages yet"
                description={
                  selected.kind === "project"
                    ? "No task on this project has any conversation yet."
                    : "Start the conversation below."
                }
              />
            ) : (
              stream.map((m, idx) => {
                const prev = idx > 0 ? stream[idx - 1] : null;
                const sameAuthor = !!prev && prev.authorId === m.authorId;
                const within5 =
                  !!prev &&
                  Math.abs(new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) <
                    5 * 60 * 1000;
                const showHeader = !sameAuthor || !within5;
                const a = authors[m.authorId];
                const senderName = a?.full_name ?? a?.email ?? "User";
                return (
                  <div
                    key={m.id}
                    className={cn("flex items-start gap-3", showHeader ? "mt-3" : "mt-0.5")}
                  >
                    {showHeader ? (
                      <UserAvatar userId={m.authorId} size="md" />
                    ) : (
                      <div className="w-10 shrink-0" />
                    )}
                    <div className="max-w-[75%] min-w-0">
                      {showHeader && (
                        <div className="text-[12px] flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="font-semibold text-foreground">{senderName}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {fmtIST(m.createdAt)}
                          </span>
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {m.scope}
                          </Badge>
                          {m.taskId && selected.kind !== "task" && (
                            <Link
                              to="/ops/tasks/$taskId"
                              params={{ taskId: m.taskId }}
                              className="hover:text-primary"
                            >
                              Open task
                            </Link>
                          )}
                          {!m.clientVisible ? (
                            <Badge
                              variant="destructive"
                              className="text-[10px] bg-amber-500 text-white hover:bg-amber-500/90 border-amber-600"
                            >
                              <EyeOff className="h-3 w-3 mr-1" />
                              Internal only
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Client visible
                            </Badge>
                          )}
                        </div>
                      )}
                      <div
                        className={cn(
                          "inline-block whitespace-pre-wrap text-sm rounded-md px-3 py-1.5 border bg-muted/40",
                          !m.clientVisible &&
                            "border-l-[3px] border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20",
                        )}
                      >
                        {renderMentioned(m.body)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {selected.kind !== "project" && (
            <div className="border-t p-3 space-y-2">
              {isInternal && (
                <div className="flex items-center gap-2 text-xs">
                  <Switch id="internal" checked={internal} onCheckedChange={setInternal} />
                  <Label
                    htmlFor="internal"
                    className="text-xs cursor-pointer flex items-center gap-1"
                  >
                    {internal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {internal ? "Internal only (clients won't see)" : "Visible to clients"}
                  </Label>
                </div>
              )}
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <MentionTextarea
                    value={body}
                    onChange={setBody}
                    onMentionsChange={setMentions}
                    placeholder={composerPlaceholder}
                    rows={2}
                  />
                </div>
                <Button
                  onClick={() => send.mutate()}
                  disabled={send.isPending || !body.trim()}
                  className="shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Type @ to mention teammates · they'll get a notification
              </p>
            </div>
          )}
          {selected.kind === "project" && (
            <div className="border-t p-3 text-xs text-muted-foreground">
              Select a specific task to reply, or switch to "Firm conversation" to post a firm-wide
              message.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
