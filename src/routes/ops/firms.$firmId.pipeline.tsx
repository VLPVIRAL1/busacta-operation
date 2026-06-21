import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Kanban, Info, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { TaskTimerControl } from "@/components/ops/timer-widget";
import { TaskEditButton } from "@/components/ops/task-edit-sheet";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/ops/firms/$firmId/pipeline")({
  component: FirmPipelinePage,
  errorComponent: RouteErrorComponent,
});

import { toneChip } from "@/lib/ui/tone";

const STAGES = [
  { key: "handover_received", label: "Handover Received", tone: toneChip("slate") },
  { key: "in_prep", label: "In-Prep", tone: toneChip("blue") },
  { key: "internal_qc", label: "Internal QC", tone: toneChip("amber") },
  { key: "waiting_cpa", label: "Waiting on B2B Firm", tone: toneChip("rose") },
  { key: "ready_for_delivery", label: "Ready for Delivery", tone: toneChip("emerald") },
  { key: "final_signoff", label: "Final Sign-off", tone: toneChip("green") },
] as const;

type StageKey = (typeof STAGES)[number]["key"];
type MajorKey = "with_bat" | "with_cpa" | "on_hold" | "completed";
const STAGE_TO_MAJOR: Record<StageKey, MajorKey> = {
  handover_received: "with_bat",
  in_prep: "with_bat",
  internal_qc: "with_bat",
  waiting_cpa: "with_cpa",
  ready_for_delivery: "with_cpa",
  final_signoff: "completed",
};
const MAJOR_STAGES: { key: MajorKey; label: string; tone: string }[] = [
  { key: "with_bat", label: "With BAT", tone: toneChip("blue") },
  { key: "with_cpa", label: "With CPA", tone: toneChip("amber") },
  { key: "on_hold", label: "On Hold", tone: toneChip("rose") },
  { key: "completed", label: "Completed", tone: toneChip("emerald") },
];

const PRIORITY_BAR: Record<string, { bar: string; label: string; chip: string }> = {
  low: { bar: "bg-slate-300 dark:bg-slate-500", label: "Low", chip: toneChip("slate") },
  medium: { bar: "bg-blue-400 dark:bg-blue-500", label: "Medium", chip: toneChip("blue") },
  high: { bar: "bg-amber-500", label: "High", chip: toneChip("amber") },
  urgent: { bar: "bg-rose-500 animate-pulse", label: "Critical", chip: toneChip("rose") },
};

function dueChip(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  let cls = "bg-muted text-muted-foreground";
  let label = `Due ${d.toLocaleDateString()}`;
  if (days < 0) {
    cls = toneChip("rose");
    label = `Overdue · ${d.toLocaleDateString()}`;
  } else if (days <= 7) {
    cls = toneChip("amber");
    label = `Due in ${days}d`;
  }
  return (
    <Badge variant="outline" className={cn("text-[10px] border-0", cls)}>
      {label}
    </Badge>
  );
}

function FirmPipelinePage() {
  const { firmId } = Route.useParams();
  const [showLegend, setShowLegend] = useState(false);
  const qc = useQueryClient();
  const queryKey = ["firm-pipeline", firmId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, pipeline_stage, priority, due_date, client_id, client_entities!inner(name, project_id, projects!inner(name, firm_id)), clients(id, name, kind)",
        )
        .eq("client_entities.projects.firm_id", firmId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const moveStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ pipeline_stage: stage as StageKey })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any[]>(queryKey) ?? [];
      qc.setQueryData(
        queryKey,
        prev.map((t) => (t.id === id ? { ...t, pipeline_stage: stage } : t)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(e.message || "Could not move task");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const onDropToStage = (stageKey: string, e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/task-id") || e.dataTransfer.getData("text/plain");
    const from = e.dataTransfer.getData("text/from-stage");
    const m = raw && raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const id = m ? m[0] : "";
    if (id && from !== stageKey) moveStage.mutate({ id, stage: stageKey });
  };

  const { data: clientList } = useQuery({
    queryKey: ["firm-pipeline-clients", firmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, kind, parent_id")
        .eq("firm_id", firmId)
        .order("kind")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [urgencies, setUrgencies] = useState<string[]>([]); // empty = all
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [search, setSearch] = useState("");
  const [grouping, setGrouping] = useState<"detailed" | "grouped">("detailed");
  const applyFP = (f: Record<string, any>) => {
    setUrgencies(Array.isArray(f.urgencies) ? f.urgencies : []);
    setDueFilter(f.dueFilter ?? "all");
    setStageFilter(f.stageFilter ?? "all");
    setClientFilter(f.clientFilter ?? "all");
    setSortBy(f.sortBy ?? "newest");
    setSearch(f.search ?? "");
  };

  const filtered = useMemo(() => {
    let rows = (data ?? []) as Array<{
      id: string;
      title: string;
      pipeline_stage: string;
      priority: string;
      due_date: string | null;
      client_id: string | null;
      created_at?: string;
    }>;
    if (urgencies.length) rows = rows.filter((t) => urgencies.includes(t.priority));
    if (stageFilter !== "all") rows = rows.filter((t) => t.pipeline_stage === stageFilter);
    if (clientFilter === "none") rows = rows.filter((t) => !t.client_id);
    else if (clientFilter !== "all") rows = rows.filter((t) => t.client_id === clientFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter((t) => t.title.toLowerCase().includes(s));
    }
    if (dueFilter !== "all") {
      const now = Date.now();
      rows = rows.filter((t) => {
        if (dueFilter === "none") return !t.due_date;
        if (!t.due_date) return false;
        const days = Math.ceil((new Date(t.due_date).getTime() - now) / 86400000);
        if (dueFilter === "overdue") return days < 0;
        if (dueFilter === "7d") return days >= 0 && days <= 7;
        if (dueFilter === "30d") return days >= 0 && days <= 30;
        return true;
      });
    }
    const prioRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortBy === "due_asc" || sortBy === "due_desc") {
        const av = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bv = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return sortBy === "due_asc" ? av - bv : bv - av;
      }
      if (sortBy === "urgency") return (prioRank[a.priority] ?? 9) - (prioRank[b.priority] ?? 9);
      return 0; // 'newest'/'oldest' rely on data order; data already DESC by created_at
    });
    if (sortBy === "oldest") sorted.reverse();
    return sorted;
  }, [data, urgencies, dueFilter, stageFilter, clientFilter, sortBy, search]);

  const hasActiveFilter =
    urgencies.length > 0 ||
    dueFilter !== "all" ||
    stageFilter !== "all" ||
    clientFilter !== "all" ||
    sortBy !== "newest" ||
    !!search.trim();

  const groupedClients = useMemo(() => {
    const all = (clientList ?? []) as Array<{
      id: string;
      name: string;
      kind: string;
      parent_id: string | null;
    }>;
    const groups = all.filter((c) => c.kind === "group");
    const ungrouped = all.filter((c) => c.kind === "client" && !c.parent_id);
    return { groups, ungrouped, all };
  }, [clientList]);

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((s) => (
          <Skeleton key={s.key} className="h-64" />
        ))}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<Kanban className="h-10 w-10" />}
        title="No tasks in pipeline"
        description="Work items under this firm will appear here grouped by pipeline stage."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border-subtle glass p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-44"
          />
          <Select value={dueFilter} onValueChange={setDueFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Due date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any due date</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="7d">Due in 7 days</SelectItem>
              <SelectItem value="30d">Due in 30 days</SelectItem>
              <SelectItem value="none">No due date</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              <SelectItem value="none">— No client —</SelectItem>
              {groupedClients.groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  📁 {g.name}
                </SelectItem>
              ))}
              {groupedClients.all
                .filter((c) => c.kind === "client")
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="due_asc">Due date ↑</SelectItem>
              <SelectItem value="due_desc">Due date ↓</SelectItem>
              <SelectItem value="urgency">Urgency</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setUrgencies([]);
                setDueFilter("all");
                setStageFilter("all");
                setClientFilter("all");
                setSortBy("newest");
                setSearch("");
              }}
            >
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Select value={grouping} onValueChange={(v) => setGrouping(v as typeof grouping)}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="detailed">Detailed stages</SelectItem>
                <SelectItem value="grouped">Grouped (4 stages)</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {filtered.length} of {data.length} tasks
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLegend((v) => !v)}
              className="text-xs"
            >
              <Info className="h-3.5 w-3.5 mr-1" /> {showLegend ? "Hide" : "Show"} legend
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Urgency:</span>
          {(["urgent", "high", "medium", "low"] as const).map((p) => {
            const meta = PRIORITY_BAR[p];
            const active = urgencies.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setUrgencies((cur) => (active ? cur.filter((x) => x !== p) : [...cur, p]))
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                  active
                    ? meta.chip + " border-transparent"
                    : "bg-background hover:bg-muted text-muted-foreground",
                )}
              >
                <span className={cn("inline-block h-2.5 w-1 rounded-sm", meta.bar)} /> {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {showLegend && (
        <div className="rounded-lg border glass p-3 text-xs flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Urgency:</span>
            {Object.entries(PRIORITY_BAR).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={cn("inline-block h-3 w-1 rounded-sm", v.bar)} /> {v.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Due:</span>
            <Badge variant="outline" className={cn("border-0 text-[10px]", toneChip("rose"))}>
              Overdue
            </Badge>
            <Badge variant="outline" className={cn("border-0 text-[10px]", toneChip("amber"))}>
              ≤ 7 days
            </Badge>
            <Badge
              variant="outline"
              className="border-0 bg-muted text-muted-foreground text-[10px]"
            >
              Later
            </Badge>
          </div>
        </div>
      )}
      <div
        className={cn(
          "grid gap-3",
          grouping === "grouped"
            ? "md:grid-cols-2 xl:grid-cols-4"
            : "md:grid-cols-3 xl:grid-cols-6",
        )}
      >
        {(grouping === "grouped" ? MAJOR_STAGES : STAGES).map((stage) => {
          const items =
            grouping === "grouped"
              ? filtered.filter(
                  (t) =>
                    STAGE_TO_MAJOR[t.pipeline_stage as StageKey] ===
                    (stage as { key: MajorKey }).key,
                )
              : filtered.filter((t) => t.pipeline_stage === stage.key);
          // For grouped major stages, drop targets the first sub-stage in the group.
          const dropTarget: string =
            grouping === "grouped"
              ? (Object.entries(STAGE_TO_MAJOR).find(
                  ([, mk]) => mk === (stage as { key: MajorKey }).key,
                )?.[0] ?? STAGES[0].key)
              : stage.key;
          return (
            <div
              key={stage.key}
              className="rounded-xl border border-border-subtle glass p-2 min-h-[200px]"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => onDropToStage(dropTarget, e)}
            >
              <div
                className={cn(
                  "mb-2 flex items-center justify-between rounded-md px-2 py-1 border",
                  stage.tone,
                )}
              >
                <span className="text-xs font-semibold">{stage.label}</span>
                <span className="text-xs tabular-nums">{items.length}</span>
              </div>
              <ul className="space-y-2">
                {items.map((t) => {
                  const prio = PRIORITY_BAR[t.priority] ?? PRIORITY_BAR.medium;
                  const client = (
                    t as unknown as { clients?: { name: string; kind: string } | null }
                  ).clients;
                  return (
                    <li key={t.id}>
                      <Card
                        className="hover:shadow-md transition-shadow overflow-hidden cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/task-id", t.id);
                          e.dataTransfer.setData("text/from-stage", t.pipeline_stage ?? "");
                          e.dataTransfer.setData("text/plain", t.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                      >
                        <div className="flex">
                          <div
                            className={cn("w-1 shrink-0", prio.bar)}
                            aria-label={`${prio.label} urgency`}
                          />
                          <CardContent className="p-3 flex-1 min-w-0">
                            <div className="flex items-start gap-1.5">
                              <GripVertical className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <Link
                                  to="/ops/tasks/$taskId"
                                  params={{ taskId: t.id }}
                                  draggable={false}
                                  onDragStart={(e) => e.preventDefault()}
                                  className="block"
                                >
                                  <div className="text-sm font-medium line-clamp-2 hover:text-primary">
                                    {t.title}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground mt-1 truncate">
                                    {
                                      (
                                        t as unknown as {
                                          client_entities?: { projects?: { name?: string } };
                                        }
                                      ).client_entities?.projects?.name
                                    }
                                    {client &&
                                      ` · ${client.kind === "group" ? "📁 " : ""}${client.name}`}
                                  </div>
                                </Link>
                                <div className="mt-2 flex flex-wrap gap-1 items-center">
                                  <Badge
                                    variant="outline"
                                    className={cn("text-[10px] border-0", prio.chip)}
                                  >
                                    {prio.label}
                                  </Badge>
                                  {(() => {
                                    const ent = (
                                      t as unknown as { client_entities?: { name?: string } }
                                    ).client_entities;
                                    if (!ent?.name || ent.name === "__project_default") return null;
                                    return (
                                      <Badge variant="outline" className="text-[10px]">
                                        🏢 {ent.name}
                                      </Badge>
                                    );
                                  })()}
                                  {dueChip(t.due_date)}
                                  <div className="ml-auto flex items-center gap-1">
                                    <TaskTimerControl taskId={t.id} compact />
                                    <TaskEditButton taskId={t.id} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
