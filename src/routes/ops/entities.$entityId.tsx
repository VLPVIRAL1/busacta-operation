import { createFileRoute, Link, Navigate, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ListChecks,
  Plus,
  Calendar,
  ExternalLink,
  ClipboardList,
  CircleDot,
  Flag,
  Cpu,
  CalendarRange,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { FirmCode, ProjectCode } from "@/components/shared/entity-code";
import { GridErrorState } from "@/components/shared/grid-states";
import { FacetedMultiChip } from "@/components/shared/faceted-multi-chip";
import { CreateWorkItemModal } from "@/components/ops/create-work-item-modal";
import { entityDetailQuery, entityTasksQuery, updateEntityTask } from "@/lib/queries/ops.queries";
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  SOFTWARE_OPTIONS,
  ENTITY_TYPE_OPTIONS,
  formatEntityDisplayName,
  isHiddenDefaultEntity,
  type TaskPriority,
  type TaskStatus,
  type SoftwareType,
  labelFor,
} from "@/lib/shared/domain";
import { PriorityIcon } from "@/lib/ui/task-option-icons";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";

// Legacy UUID route — kept permanently as a redirect to the canonical readable
// /projects/<project-slug>/<entity-slug> URL. This module also exports
// `EntityDetailView`, rendered by the new nested slug route.
export const Route = createFileRoute("/ops/entities/$entityId")({
  component: LegacyEntityRedirect,
  errorComponent: RouteErrorComponent,
});

// Resolve id→(project slug, entity slug) client-side so the lookup runs with the
// authenticated Supabase session (a server-side beforeLoad lookup would 404 under
// RLS). Kept permanently so legacy /ops/entities/<uuid> links keep resolving.
function LegacyEntityRedirect() {
  const { entityId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["legacy-entity-slug", entityId],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_entities")
        .select("slug, projects(slug)")
        .eq("id", entityId)
        .maybeSingle();
      return data;
    },
  });
  if (isLoading) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-1/2" />
      </div>
    );
  }
  const projectSlug = (data as { projects?: { slug?: string } | null } | null)?.projects?.slug;
  if (!data?.slug || !projectSlug) throw notFound();
  return (
    <Navigate
      to="/projects/$projectSlug/$entitySlug"
      params={{ projectSlug, entitySlug: data.slug }}
      replace
    />
  );
}

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
}

type EntityDetail = {
  id: string;
  name: string | null;
  slug: string;
  identifier: string | null;
  entity_type: "individual" | "business" | null;
  software: SoftwareType | null;
  project_id: string | null;
  client_id: string | null;
  projects: {
    id: string;
    name: string;
    slug: string;
    code: string | null;
    firm_id: string;
    firms: { id: string; name: string; firm_identifier: string | null } | null;
  } | null;
};

const STATUS_ORDER: TaskStatus[] = ["in_progress", "review", "waiting_client", "draft", "complete"];

export function EntityDetailView({ entityId }: { entityId: string }) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isInternal = role === "admin" || role === "employee";
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [softwareFilter, setSoftwareFilter] = useState<string[]>([]);

  const { data: entityRaw, isLoading: entityLoading } = useQuery(entityDetailQuery(entityId));
  const entity = entityRaw as EntityDetail | undefined;

  const project = entity?.projects ?? null;
  const firm = project?.firms ?? null;
  const projectId = project?.id ?? null;
  const firmId = project?.firm_id ?? null;
  const defaultClientId = entity?.client_id ?? null;
  const hiddenDefault = isHiddenDefaultEntity(entity?.name);
  const displayName = formatEntityDisplayName(entity?.name);

  const {
    data: tasks,
    isLoading: tasksLoading,
    isError,
    refetch,
  } = useQuery(entityTasksQuery<TaskRow>(entityId));

  const updateTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskRow> }) =>
      updateEntityTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks", entityId] });
      const prev = qc.getQueryData<TaskRow[]>(["tasks", entityId]);
      qc.setQueryData<TaskRow[]>(["tasks", entityId], (cur) =>
        (cur ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks", entityId], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", entityId] });
    },
  });

  // Aggregate KPI tiles
  const kpis = useMemo(() => {
    const list = tasks ?? [];
    return {
      total: list.length,
      open: list.filter((t) => t.status !== "complete").length,
      in_progress: list.filter((t) => t.status === "in_progress").length,
      waiting_client: list.filter((t) => t.status === "waiting_client").length,
      complete: list.filter((t) => t.status === "complete").length,
    };
  }, [tasks]);

  // Filter
  const filtered = useMemo(() => {
    const list = tasks ?? [];
    return list.filter((t) => {
      if (statusFilter.length && !statusFilter.includes(t.status)) return false;
      if (priorityFilter.length && !priorityFilter.includes(t.priority)) return false;
      if (softwareFilter.length) {
        const s = t.software ?? "__none__";
        if (!softwareFilter.includes(s)) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, softwareFilter]);

  // Group by status for accordion-style sections
  const grouped = useMemo(() => {
    const m = new Map<TaskStatus, TaskRow[]>();
    for (const t of filtered) {
      const arr = m.get(t.status) ?? [];
      arr.push(t);
      m.set(t.status, arr);
    }
    return STATUS_ORDER.filter((s) => (m.get(s) ?? []).length > 0).map((s) => ({
      status: s,
      items: m.get(s)!,
    }));
  }, [filtered]);

  const statusOptions = TASK_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  const priorityOptions = TASK_PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks ?? []) m.set(t.status, (m.get(t.status) ?? 0) + 1);
    return m;
  }, [tasks]);
  const priorityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks ?? []) m.set(t.priority, (m.get(t.priority) ?? 0) + 1);
    return m;
  }, [tasks]);
  const softwareOptions = useMemo(() => {
    const opts = [
      ...SOFTWARE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })),
      { value: "__none__", label: "— No software" },
    ];
    return opts.filter((o) => (tasks ?? []).some((t) => (t.software ?? "__none__") === o.value));
  }, [tasks]);
  const softwareCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks ?? []) {
      const k = t.software ?? "__none__";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  const entityTypeLabel = entity?.entity_type
    ? labelFor(ENTITY_TYPE_OPTIONS, entity.entity_type)
    : null;

  return (
    <AuthGuard>
      <AppShell
        crumbs={[
          { label: "Firms", to: "/ops/firms" },
          firm ? { label: firm.name, to: `/ops/firms/${firm.id}` } : { label: "…" },
          project ? { label: project.name, to: `/projects/${project.slug}` } : { label: "…" },
          { label: entity ? displayName : "…" },
        ]}
      >
        <PageHeader
          title={entityLoading ? "…" : displayName}
          description={
            entity ? (
              <span className="flex flex-wrap items-center gap-1.5 text-xs">
                {firm && <FirmCode code={firm.firm_identifier} name={firm.name} />}
                {project && <ProjectCode code={project.code} name={project.name} />}
                {!hiddenDefault && entity.identifier && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {entity.identifier}
                  </Badge>
                )}
                {!hiddenDefault && entityTypeLabel && (
                  <Badge variant="secondary" className="text-[10px]">
                    {entityTypeLabel}
                  </Badge>
                )}
                {hiddenDefault && (
                  <Badge variant="secondary" className="text-[10px]">
                    Default group · this project skips the Entity layer
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  · {kpis.total} {kpis.total === 1 ? "work item" : "work items"}
                </span>
              </span>
            ) : (
              ""
            )
          }
          actions={
            <div className="flex items-center gap-1.5">
              {project && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  title="Open project"
                  aria-label="Open project"
                >
                  <Link to="/projects/$projectSlug" params={{ projectSlug: project.slug }}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Project
                  </Link>
                </Button>
              )}
              {isInternal && projectId && firmId && (
                <>
                  <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
                    <Plus className="h-4 w-4" />
                    New Work Item
                  </Button>
                  <CreateWorkItemModal
                    open={open}
                    onOpenChange={setOpen}
                    projectId={projectId}
                    firmId={firmId}
                    defaultClientId={defaultClientId}
                    onCreated={() => {
                      qc.invalidateQueries({ queryKey: ["tasks", entityId] });
                    }}
                  />
                </>
              )}
            </div>
          }
        />

        {/* KPI strip */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiTile label="Open" value={kpis.open} tone="text-blue-600 dark:text-blue-300" />
          <KpiTile
            label="In progress"
            value={kpis.in_progress}
            tone="text-amber-600 dark:text-amber-300"
          />
          <KpiTile
            label="Waiting client"
            value={kpis.waiting_client}
            tone="text-rose-600 dark:text-rose-300"
          />
          <KpiTile
            label="Complete"
            value={kpis.complete}
            tone="text-emerald-600 dark:text-emerald-300"
          />
        </div>

        {/* Toolbar — wrapping faceted chips */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <FacetedMultiChip
            label="Status"
            icon={<CircleDot className="h-3 w-3" />}
            options={statusOptions}
            selected={statusFilter}
            onChange={setStatusFilter}
            counts={statusCounts}
          />
          <FacetedMultiChip
            label="Priority"
            icon={<Flag className="h-3 w-3" />}
            options={priorityOptions}
            selected={priorityFilter}
            onChange={setPriorityFilter}
            counts={priorityCounts}
          />
          {softwareOptions.length > 0 && (
            <FacetedMultiChip
              label="Software"
              icon={<Cpu className="h-3 w-3" />}
              options={softwareOptions}
              selected={softwareFilter}
              onChange={setSoftwareFilter}
              counts={softwareCounts}
            />
          )}
          {(statusFilter.length || priorityFilter.length || softwareFilter.length) > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setStatusFilter([]);
                setPriorityFilter([]);
                setSoftwareFilter([]);
              }}
            >
              Clear
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            <ClipboardList className="mr-1 inline h-3 w-3" />
            {filtered.length} of {kpis.total}
          </span>
        </div>

        {/* Body */}
        {tasksLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : isError ? (
          <GridErrorState error={null} onRetry={() => refetch()} />
        ) : (tasks ?? []).length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-10 w-10" />}
            title="No work items yet"
            description={
              isInternal
                ? "Add a work item to get started."
                : "Work items will appear here as they are created."
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-10 w-10" />}
            title="Nothing matches"
            description="Try clearing some filters."
          />
        ) : (
          <div className="space-y-4">
            {grouped.map(({ status, items }) => {
              const meta = TASK_STATUS_OPTIONS.find((o) => o.value === status);
              return (
                <section key={status}>
                  <header className="mb-1.5 flex items-center gap-2">
                    <Badge className={cn("text-[10px] capitalize", meta?.tone)}>
                      {meta?.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </header>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <WorkItemRow
                        key={t.id}
                        task={t}
                        isInternal={isInternal}
                        onPatch={(patch) => updateTask.mutate({ id: t.id, patch })}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

function WorkItemRow({
  task,
  isInternal,
  onPatch,
}: {
  task: TaskRow;
  isInternal: boolean;
  onPatch: (patch: Partial<TaskRow>) => void;
}) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="p-3">
        <div className="flex flex-wrap items-start gap-3">
          <Link
            to="/ops/tasks/$taskId"
            params={{ taskId: task.slug }}
            className="group min-w-0 flex-1"
          >
            <div className="font-medium transition-colors group-hover:text-primary">
              {task.title}
            </div>
            {task.description && (
              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {task.description}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {task.due_date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(task.due_date).toLocaleDateString()}
                </span>
              )}
              {task.tax_year && (
                <span className="inline-flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" />
                  {task.tax_year}
                </span>
              )}
              {task.software && (
                <Badge variant="outline" className="text-[10px]">
                  {labelFor(SOFTWARE_OPTIONS, task.software)}
                </Badge>
              )}
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {isInternal ? (
              <>
                <Select
                  value={task.priority}
                  onValueChange={(v) => onPatch({ priority: v as TaskPriority })}
                >
                  <SelectTrigger
                    className="h-8 w-12 text-xs justify-center"
                    aria-label={`Priority: ${task.priority}`}
                  >
                    <PriorityIcon value={task.priority} />
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
                  value={task.status}
                  onValueChange={(v) => onPatch({ status: v as TaskStatus })}
                >
                  <SelectTrigger
                    aria-label="Status"
                    className={cn(
                      "h-8 w-44 text-xs",
                      TASK_STATUS_OPTIONS.find((s) => s.value === task.status)?.tone,
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
              </>
            ) : (
              <Badge
                className={cn(
                  "capitalize",
                  TASK_STATUS_OPTIONS.find((s) => s.value === task.status)?.tone,
                )}
              >
                {labelFor(TASK_STATUS_OPTIONS, task.status)}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
