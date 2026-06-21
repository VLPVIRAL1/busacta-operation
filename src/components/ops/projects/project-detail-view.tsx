import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Plus, Calendar, X, Search } from "lucide-react";
import { toast } from "sonner";
// PageHeader removed — slim inline header is used for both embedded and standalone modes.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { FirmCode, ProjectCode } from "@/components/shared/entity-code";
import { TaskTimerControl } from "@/components/ops/timer-widget";
import { TaskEditButton } from "@/components/ops/task-edit-sheet";
import { CreateWorkItemModal } from "@/components/ops/create-work-item-modal";
import { supabase } from "@/integrations/supabase/client";
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  SOFTWARE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  HIDDEN_DEFAULT_ENTITY_NAME,
  type TaskPriority,
  type TaskStatus,
  type SoftwareType,
  type ProjectType,
  labelFor,
} from "@/lib/shared/domain";
import { PriorityIcon } from "@/lib/ui/task-option-icons";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";

interface TaskRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  software: SoftwareType | null;
  tax_year: number | null;
  client_id: string | null;
  entity_id: string;
  client_entities: { id: string; name: string; project_id: string } | null;
}

interface ClientRow {
  id: string;
  name: string;
  kind: "client" | "group";
  parent_id: string | null;
}

/**
 * Project Detail body — single source of truth. Used both by the canonical
 * `/projects/$projectSlug` route and embedded inside the Projects Command
 * Center compact split-pane (set `embedded` to swap the heavy PageHeader for
 * a compact in-pane header).
 */
export function ProjectDetailView({
  projectId,
  embedded = false,
}: {
  projectId: string;
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isInternal = role === "admin" || role === "employee";
  const isAdmin = role === "admin" || role === "super_admin";
  const [open, setOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = (await (supabase
        .from("projects" as never)
        .select(
          "id, name, slug, code, project_type, status, firm_id, sharepoint_site_id, sp_list_id_tasks, sp_list_id_messages, sp_list_id_audit, sp_list_id_documents, firms(id, name, firm_identifier)",
        )
        .eq("id", projectId)
        .maybeSingle() as any)) as {
        data: {
          id: string;
          name: string;
          slug: string | null;
          code: string | null;
          project_type: string;
          status: string;
          firm_id: string | null;
          sharepoint_site_id: string | null;
          sp_list_id_tasks: string | null;
          sp_list_id_messages: string | null;
          sp_list_id_audit: string | null;
          sp_list_id_documents: string | null;
          firms: { id: string; name: string; firm_identifier: string | null } | null;
        } | null;
        error: { message: string } | null;
      };
      if (error) throw error;
      return data;
    },
  });

  const firm = (
    project as
      | { firms?: { id: string; name: string; firm_identifier?: string | null } | null }
      | undefined
  )?.firms;
  const firmId = firm?.id ?? null;

  const { data: clientList } = useQuery({
    queryKey: ["project-clients", firmId],
    enabled: !!firmId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, kind, parent_id")
        .eq("firm_id", firmId!)
        .order("kind")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, slug, title, description, status, priority, due_date, software, tax_year, client_id, entity_id, client_entities!inner(id, name, project_id)",
        )
        .eq("client_entities.project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TaskRow[];
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Omit<TaskRow, "client_entities">>;
    }) => {
      const safePatch = Object.fromEntries(
        Object.entries(patch as Record<string, unknown>).filter(([, v]) => v !== ""),
      );
      if (Object.keys(safePatch).length === 0) return;
      const { error } = await supabase.from("tasks").update(safePatch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["project-tasks", projectId] });
      const prev = qc.getQueryData<TaskRow[]>(["project-tasks", projectId]);
      qc.setQueryData<TaskRow[]>(["project-tasks", projectId], (cur) =>
        (cur ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["project-tasks", projectId], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-tasks", projectId] }),
  });

  const clientById = useMemo(() => {
    const m = new Map<string, ClientRow>();
    (clientList ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [clientList]);

  const filtered = useMemo(() => {
    let rows = tasks ?? [];
    if (clientFilter === "none") rows = rows.filter((t) => !t.client_id);
    else if (clientFilter !== "all") rows = rows.filter((t) => t.client_id === clientFilter);
    if (statusFilter !== "all") rows = rows.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") rows = rows.filter((t) => t.priority === priorityFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (t) => t.title.toLowerCase().includes(s) || (t.description ?? "").toLowerCase().includes(s),
      );
    }
    return rows;
  }, [tasks, clientFilter, statusFilter, priorityFilter, search]);

  const hasFilter =
    clientFilter !== "all" || statusFilter !== "all" || priorityFilter !== "all" || !!search.trim();

  const projectType =
    (project as { project_type?: ProjectType } | undefined)?.project_type ?? "other";
  const ptMeta =
    PROJECT_TYPE_OPTIONS.find((o) => o.value === projectType) ??
    PROJECT_TYPE_OPTIONS[PROJECT_TYPE_OPTIONS.length - 1];

  return (
    <div
      className={cn(
        "flex flex-col",
        embedded ? "h-full min-h-0" : "h-[calc(100svh-120px)] min-h-0",
      )}
    >
      {/* Slim compact header — used in BOTH embedded and standalone modes */}
      <div className="shrink-0 border-b px-4 py-2 flex items-center gap-2 flex-wrap bg-background/95 backdrop-blur">
        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
          <ProjectCode
            code={(project as { code?: string | null } | undefined)?.code}
            name={project?.name}
          />
          <span className="text-sm font-semibold truncate">{project?.name ?? "…"}</span>
          <Badge className={ptMeta.tone + " border-0 text-[10px]"}>{ptMeta.label}</Badge>
          {firm && <FirmCode code={firm.firm_identifier} name={firm.name} />}
        </div>
        {isInternal && firmId && (
          <div className="flex items-center gap-1.5 shrink-0">
            {embedded && (
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                <Link
                  to="/projects/$projectSlug"
                  params={{ projectSlug: (project as { slug?: string } | undefined)?.slug ?? "" }}
                >
                  Open
                </Link>
              </Button>
            )}
            <Button size="sm" onClick={() => setOpen(true)} className="h-7">
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Work Item
            </Button>
            <CreateWorkItemModal
              open={open}
              onOpenChange={setOpen}
              projectId={projectId}
              firmId={firmId}
              onCreated={() => {
                qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
                qc.invalidateQueries({ queryKey: ["project-entities", projectId] });
              }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 scroll-modern">
        {/* Filter bar */}
        <Card className="glass border-border-subtle mb-3">
          <CardContent className="p-2.5 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search work items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-56 pl-7"
              />
            </div>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                <SelectItem value="none">— No client —</SelectItem>
                {(clientList ?? [])
                  .filter((c) => c.kind === "group")
                  .map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      📁 {g.name}
                    </SelectItem>
                  ))}
                {(clientList ?? [])
                  .filter((c) => c.kind === "client")
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {TASK_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Filter by priority">
                {priorityFilter === "all" ? (
                  <span className="text-muted-foreground">Priority</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <PriorityIcon value={priorityFilter} />
                  </span>
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {TASK_PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex items-center gap-1.5">
                      <PriorityIcon value={o.value} />
                      {o.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setClientFilter("all");
                  setStatusFilter("all");
                  setPriorityFilter("all");
                  setSearch("");
                }}
              >
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {filtered.length} of {(tasks ?? []).length}
            </span>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-10 w-10" />}
            title={hasFilter ? "No work items match your filters" : "No work items yet"}
            description={
              hasFilter
                ? "Try clearing filters."
                : isInternal
                  ? "Add a work item or pick a workflow template."
                  : "Work items will appear here as they are created."
            }
          />
        ) : (
          <div className="rounded-md border bg-background overflow-hidden">
            {filtered.map((t, idx) => {
              const client = t.client_id ? clientById.get(t.client_id) : null;
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50",
                    idx !== filtered.length - 1 && "border-b",
                  )}
                >
                  <Link
                    to="/ops/tasks/$taskId"
                    params={{ taskId: t.slug }}
                    className="min-w-0 flex-1 flex items-center gap-2"
                  >
                    <span className="font-medium truncate hover:text-primary">{t.title}</span>
                    {t.client_entities && t.client_entities.name !== HIDDEN_DEFAULT_ENTITY_NAME && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        🏢 {t.client_entities.name}
                      </Badge>
                    )}
                    {client && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {client.kind === "group" ? "📁 " : ""}
                        {client.name}
                      </Badge>
                    )}
                    {t.software && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {labelFor(SOFTWARE_OPTIONS, t.software)}
                      </Badge>
                    )}
                    {t.due_date && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        <Calendar className="h-3 w-3" />
                        {new Date(t.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isInternal ? (
                      <>
                        <Select
                          value={t.priority}
                          onValueChange={(v) =>
                            updateTask.mutate({ id: t.id, patch: { priority: v as TaskPriority } })
                          }
                        >
                          <SelectTrigger
                            className="h-7 w-10 text-xs justify-center px-1"
                            aria-label={`Priority: ${t.priority}`}
                          >
                            <PriorityIcon value={t.priority} />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_PRIORITY_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                <span className="flex items-center gap-1.5">
                                  <PriorityIcon value={o.value} />
                                  {o.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={t.status}
                          onValueChange={(v) =>
                            updateTask.mutate({ id: t.id, patch: { status: v as TaskStatus } })
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "h-7 w-40 text-xs",
                              TASK_STATUS_OPTIONS.find((s) => s.value === t.status)?.tone,
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_STATUS_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <TaskTimerControl taskId={t.id} compact />
                        <TaskEditButton taskId={t.id} />
                      </>
                    ) : (
                      <Badge
                        className={cn(
                          "capitalize text-[10px]",
                          TASK_STATUS_OPTIONS.find((s) => s.value === t.status)?.tone,
                        )}
                      >
                        {labelFor(TASK_STATUS_OPTIONS, t.status)}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SharePoint Lists — admin only */}
      {isAdmin && <SharePointListsCard projectId={projectId} project={project} />}
    </div>
  );
}

// ── SharePoint Lists provisioning card ───────────────────────────────────────

type SpProject =
  | {
      sharepoint_site_id?: string | null;
      sp_list_id_tasks?: string | null;
      sp_list_id_messages?: string | null;
      sp_list_id_audit?: string | null;
      sp_list_id_documents?: string | null;
    }
  | null
  | undefined;

function spStatus(p: SpProject): "provisioned" | "partial" | "not_provisioned" | "no_site" {
  if (!p?.sharepoint_site_id) return "no_site";
  const ids = [
    p.sp_list_id_tasks,
    p.sp_list_id_messages,
    p.sp_list_id_audit,
    p.sp_list_id_documents,
  ];
  const filled = ids.filter(Boolean).length;
  if (filled === 4) return "provisioned";
  if (filled > 0) return "partial";
  return "not_provisioned";
}

function SharePointListsCard({ projectId, project }: { projectId: string; project: SpProject }) {
  const qc = useQueryClient();
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
    staleTime: 60_000,
  });

  const provision = useMutation({
    mutationFn: async () => {
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/sharepoint/provision-project-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      toast.success("Provision job queued — lists will appear on SharePoint shortly.");
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = spStatus(project);

  const badge = {
    provisioned: (
      <Badge className="bg-green-100 text-green-800 border-green-200">Lists Active</Badge>
    ),
    partial: (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200">Partially Provisioned</Badge>
    ),
    not_provisioned: (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200">Not Provisioned</Badge>
    ),
    no_site: (
      <Badge className="bg-red-100 text-red-800 border-red-200">
        Document Library Not Configured
      </Badge>
    ),
  }[status];

  return (
    <div className="shrink-0 border-t px-4 py-3 bg-muted/30">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">SharePoint Backup Lists</span>
          {badge}
        </div>
        {(status === "not_provisioned" || status === "partial") && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => provision.mutate()}
            disabled={provision.isPending}
          >
            {provision.isPending ? "Queuing…" : "Provision Lists"}
          </Button>
        )}
      </div>
    </div>
  );
}
