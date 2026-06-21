import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  MessageSquare,
  GitBranch,
  UserCheck,
  ClipboardList,
  Eye,
  Download,
  Tag,
  User as UserIcon,
  Building2,
  Layers,
  Settings2,
  Filter as FilterIcon,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toneChip } from "@/lib/ui/tone";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { FilterBar } from "@/components/shared/filter-bar";
import { FacetedSingleChip } from "@/components/shared/faceted-multi-chip";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { FirmCode, ProjectCode } from "@/components/shared/entity-code";
import { computeFacets } from "@/lib/ops/facets";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";
import { buildProfileLabelMap } from "@/lib/shared/profile-name";

import { fmtIST, fmtEST } from "@/lib/format/time";
import {
  activityFeedInfinite,
  activityTasksQuery,
  activityProfilesQuery,
  type AuditRow,
} from "@/lib/queries/ops.queries";
import { VirtualRows } from "@/components/shared/virtual-rows";
import { GridErrorState, GridSkeletonRows } from "@/components/shared/grid-states";

export const Route = createFileRoute("/ops/activity")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/reports", search: { tab: "activity" } });
  },
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Activity" }]} fullBleed>
        <ActivityPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

const EVENT_META: Record<string, { icon: typeof ActivityIcon; tone: string; label: string }> = {
  task_created: { icon: ClipboardList, tone: toneChip("blue"), label: "Task created" },
  status_changed: { icon: GitBranch, tone: toneChip("amber"), label: "Status changed" },
  assignee_changed: { icon: UserCheck, tone: toneChip("sky"), label: "Assignee changed" },
  reviewer_changed: { icon: UserCheck, tone: toneChip("sky"), label: "Reviewer changed" },
  message_visibility_changed: { icon: Eye, tone: toneChip("rose"), label: "Visibility" },
  message_created: { icon: MessageSquare, tone: toneChip("emerald"), label: "Message" },
  template_applied: { icon: ClipboardList, tone: toneChip("sky"), label: "Template" },
  time_log: { icon: ActivityIcon, tone: toneChip("slate"), label: "Time logged" },
};

function describePayload(type: string, p: Record<string, unknown> | null): string {
  if (!p) return "";
  if (type === "status_changed") return `${p.from ?? "?"} → ${p.to ?? "?"}`;
  if (type === "task_created") return `Title: ${p.title ?? ""}`;
  if (type === "template_applied")
    return `Template: ${p.template ?? ""} (${p.items_created ?? 0} items)`;
  if (type === "message_visibility_changed")
    return `${p.from ? "CPA-visible" : "Internal"} → ${p.to ? "CPA-visible" : "Internal"}`;
  return "";
}

// ───────── Column registry ─────────
type ColKey = "timestamp" | "event" | "actor" | "task" | "firm" | "project";
type ColDef = {
  key: ColKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  sortable: boolean;
  filter?: "text";
  alwaysVisible?: boolean;
};

const COLS: ColDef[] = [
  {
    key: "timestamp",
    label: "Timestamp",
    defaultWidth: 160,
    minWidth: 120,
    sortable: true,
    alwaysVisible: true,
  },
  {
    key: "event",
    label: "Event",
    defaultWidth: 160,
    minWidth: 120,
    sortable: true,
    filter: "text",
  },
  {
    key: "actor",
    label: "Actor",
    defaultWidth: 170,
    minWidth: 100,
    sortable: true,
    filter: "text",
  },
  {
    key: "task",
    label: "Task / Target",
    defaultWidth: 320,
    minWidth: 160,
    sortable: true,
    filter: "text",
    alwaysVisible: true,
  },
  { key: "firm", label: "Firm", defaultWidth: 110, minWidth: 70, sortable: true, filter: "text" },
  {
    key: "project",
    label: "Project",
    defaultWidth: 110,
    minWidth: 70,
    sortable: true,
    filter: "text",
  },
];

const STORAGE_KEY = "ops:activity:grid:v1";

type GroupKey = "none" | "event" | "actor" | "firm" | "project" | "day" | "week";
type SortDir = "asc" | "desc";

type GridState = {
  visible: Record<ColKey, boolean>;
  widths: Record<ColKey, number>;
  sort: { key: ColKey; dir: SortDir } | null;
  filters: Partial<Record<ColKey, { text?: string }>>;
  groupBy: GroupKey;
  collapsed: Record<string, boolean>;
};

const defaultGridState = (): GridState => ({
  visible: Object.fromEntries(COLS.map((c) => [c.key, true])) as Record<ColKey, boolean>,
  widths: Object.fromEntries(COLS.map((c) => [c.key, c.defaultWidth])) as Record<ColKey, number>,
  sort: { key: "timestamp", dir: "desc" },
  filters: {},
  groupBy: "none",
  collapsed: {},
});

function loadGridState(): GridState {
  if (typeof window === "undefined") return defaultGridState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultGridState();
    const parsed = JSON.parse(raw) as Partial<GridState>;
    const base = defaultGridState();
    return {
      visible: { ...base.visible, ...(parsed.visible ?? {}) },
      widths: { ...base.widths, ...(parsed.widths ?? {}) },
      sort: parsed.sort ?? base.sort,
      filters: parsed.filters ?? {},
      groupBy: (parsed.groupBy ?? "none") as GroupKey,
      collapsed: parsed.collapsed ?? {},
    };
  } catch {
    return defaultGridState();
  }
}

export function ActivityPage() {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");

  // Top-level filters
  const [view, setView] = useState<"mine" | "everyone">("mine");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [firmFilter, setFirmFilter] = useState<string>("all");
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [search, setSearch] = useState("");
  const from = range.from ?? "";
  const to = range.to ?? "";

  const effectiveView: "mine" | "everyone" = isAdmin ? view : "mine";

  // Grid state (persisted)
  const [grid, setGrid] = useState<GridState>(() => defaultGridState());
  useEffect(() => {
    setGrid(loadGridState());
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
    } catch {
      /* noop */
    }
  }, [grid]);

  // Push high-selectivity filters to the server; cheap facets (firm, payload
  // search) stay client-side over the loaded pages.
  const serverFilters = useMemo(
    () => ({
      actorId:
        effectiveView === "everyone"
          ? actorFilter !== "all"
            ? actorFilter
            : null
          : (user?.id ?? null),
      eventType: eventFilter !== "all" ? eventFilter : null,
      fromIso: from || null,
      toIso: to || null,
    }),
    [effectiveView, actorFilter, eventFilter, from, to, user?.id],
  );

  const {
    data: pages,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(activityFeedInfinite(serverFilters));

  const data = useMemo<AuditRow[]>(() => (pages?.pages ?? []).flatMap((p) => p.rows), [pages]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useRealtimeChannel("activity-feed", (channel) =>
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "task_audit" }, () =>
      qc.invalidateQueries({ queryKey: ["activity-feed-infinite"] }),
    ),
  );

  const taskIds = useMemo(() => Array.from(new Set(data.map((r) => r.task_id))), [data]);
  const actorIds = useMemo(
    () => Array.from(new Set(data.map((r) => r.actor_id).filter(Boolean) as string[])),
    [data],
  );

  const { data: tasks } = useQuery(activityTasksQuery(taskIds));
  const { data: profiles } = useQuery(activityProfilesQuery(actorIds));

  const taskMap = useMemo(() => new Map((tasks ?? []).map((t: any) => [t.id, t])), [tasks]);
  const actorMap = useMemo(() => buildProfileLabelMap(profiles), [profiles]);

  const firmOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks ?? []) {
      const f = (t as any).client_entities?.projects?.firms;
      if (f?.id) m.set(f.id, f.name);
    }
    return Array.from(m, ([id, name]) => ({ value: id, label: name }));
  }, [tasks]);

  const actorOptions = useMemo(
    () =>
      (profiles ?? []).map((p: any) => ({
        value: p.id,
        label: p.full_name || p.email || "Unknown",
      })),
    [profiles],
  );

  const eventOptions = useMemo(
    () => Object.entries(EVENT_META).map(([k, v]) => ({ value: k, label: v.label })),
    [],
  );

  // Top-level predicates (split for facet count math)
  const predicates = useMemo(() => {
    return {
      view: (r: AuditRow) => effectiveView === "everyone" || r.actor_id === user?.id,
      event: (r: AuditRow) => eventFilter === "all" || r.event_type === eventFilter,
      actor: (r: AuditRow) => actorFilter === "all" || r.actor_id === actorFilter,
      firm: (r: AuditRow) => {
        if (firmFilter === "all") return true;
        const t: any = taskMap.get(r.task_id);
        return t?.client_entities?.projects?.firm_id === firmFilter;
      },
      date: (r: AuditRow) => {
        if (from && new Date(r.created_at) < new Date(from)) return false;
        if (to) {
          const end = new Date(to);
          end.setHours(23, 59, 59, 999);
          if (new Date(r.created_at) > end) return false;
        }
        return true;
      },
      search: (r: AuditRow) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const t: any = taskMap.get(r.task_id);
        const title = (t?.title ?? "").toLowerCase();
        const actor = (r.actor_id ? (actorMap.get(r.actor_id) ?? "") : "").toLowerCase();
        const payload = JSON.stringify(r.payload ?? {}).toLowerCase();
        return title.includes(q) || actor.includes(q) || payload.includes(q);
      },
    };
  }, [
    effectiveView,
    user?.id,
    eventFilter,
    actorFilter,
    firmFilter,
    from,
    to,
    search,
    taskMap,
    actorMap,
  ]);

  const rows = data;

  const baseFiltered = useMemo(
    () => rows.filter((r) => Object.values(predicates).every((p) => p(r))),
    [rows, predicates],
  );

  // ───────── Per-column derived values ─────────
  const cellValue = (r: AuditRow, key: ColKey): string | number => {
    const t: any = taskMap.get(r.task_id);
    const proj = t?.client_entities?.projects;
    const firm = proj?.firms;
    switch (key) {
      case "timestamp":
        return new Date(r.created_at).getTime();
      case "event":
        return EVENT_META[r.event_type]?.label ?? r.event_type;
      case "actor":
        return r.actor_id ? (actorMap.get(r.actor_id) ?? "System") : "System";
      case "task":
        return t?.title ?? "";
      case "firm":
        return firm?.firm_identifier ?? firm?.name ?? "";
      case "project":
        return proj?.code ?? proj?.name ?? "";
      default:
        return "";
    }
  };

  const filtered = useMemo(() => {
    let arr = baseFiltered.slice();
    for (const c of COLS) {
      const f = grid.filters[c.key];
      if (!f?.text?.trim()) continue;
      const needle = f.text.toLowerCase();
      arr = arr.filter((r) => String(cellValue(r, c.key)).toLowerCase().includes(needle));
    }
    if (grid.sort) {
      const { key, dir } = grid.sort;
      arr.sort((a, b) => {
        const av = cellValue(a, key);
        const bv = cellValue(b, key);
        if (av < bv) return dir === "asc" ? -1 : 1;
        if (av > bv) return dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFiltered, grid.filters, grid.sort, taskMap, actorMap]);

  // ───────── Grouping ─────────
  const groupKey = (r: AuditRow): { key: string; label: string } => {
    const t: any = taskMap.get(r.task_id);
    const proj = t?.client_entities?.projects;
    const firm = proj?.firms;
    switch (grid.groupBy) {
      case "event":
        return { key: r.event_type, label: EVENT_META[r.event_type]?.label ?? r.event_type };
      case "actor":
        return {
          key: r.actor_id ?? "system",
          label: r.actor_id ? (actorMap.get(r.actor_id) ?? "Unknown") : "System",
        };
      case "firm":
        return { key: firm?.id ?? "—", label: firm?.name ?? "—" };
      case "project":
        return { key: proj?.id ?? "—", label: proj?.name ?? "—" };
      case "day": {
        const d = new Date(r.created_at);
        const k = d.toISOString().slice(0, 10);
        return { key: k, label: d.toLocaleDateString() };
      }
      case "week": {
        const d = new Date(r.created_at);
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((+d - +onejan) / 86400000 + onejan.getDay() + 1) / 7);
        const k = `${d.getFullYear()}-W${week}`;
        return { key: k, label: k };
      }
      default:
        return { key: "all", label: "" };
    }
  };

  const groups = useMemo(() => {
    if (grid.groupBy === "none") return null;
    const m = new Map<string, { label: string; rows: AuditRow[] }>();
    for (const r of filtered) {
      const g = groupKey(r);
      if (!m.has(g.key)) m.set(g.key, { label: g.label, rows: [] });
      m.get(g.key)!.rows.push(r);
    }
    return Array.from(m, ([key, v]) => ({ key, label: v.label, rows: v.rows }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, grid.groupBy]);

  // Facet counts (each facet ignores its own predicate)
  const facets = useMemo(
    () =>
      computeFacets<AuditRow>(rows, predicates, {
        event: (r) => r.event_type,
        actor: (r) => r.actor_id,
        firm: (r) => {
          const t: any = taskMap.get(r.task_id);
          return t?.client_entities?.projects?.firm_id ?? null;
        },
      }),
    [rows, predicates, taskMap],
  );

  const clearFilters = () => {
    setEventFilter("all");
    setActorFilter("all");
    setFirmFilter("all");
    setRange({});
    setSearch("");
  };
  const hasFilters =
    eventFilter !== "all" ||
    actorFilter !== "all" ||
    firmFilter !== "all" ||
    !!from ||
    !!to ||
    !!search;

  const exportCsv = () => {
    const headers = [
      "Date IST",
      "Date EST",
      "Event",
      "Actor",
      "Task",
      "Firm",
      "Project",
      "Details",
    ];
    const dataRows = filtered.map((r) => {
      const t: any = taskMap.get(r.task_id);
      const proj = t?.client_entities?.projects;
      const firm = proj?.firms;
      return [
        fmtIST(r.created_at),
        fmtEST(r.created_at),
        EVENT_META[r.event_type]?.label ?? r.event_type,
        r.actor_id ? (actorMap.get(r.actor_id) ?? "") : "System",
        t?.title ?? "",
        firm?.name ?? "",
        proj?.name ?? "",
        describePayload(r.event_type, r.payload),
      ];
    });
    const csv = [headers, ...dataRows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ───────── Render helpers ─────────
  const visibleCols = COLS.filter((c) => grid.visible[c.key]);
  const gridTemplate = visibleCols.map((c) => `${grid.widths[c.key]}px`).join(" ");

  const renderRow = (r: AuditRow) => {
    const meta = EVENT_META[r.event_type] ?? {
      icon: ActivityIcon,
      tone: "bg-muted text-muted-foreground",
      label: r.event_type,
    };
    const Icon = meta.icon;
    const t: any = taskMap.get(r.task_id);
    const taskTitle = t?.title ?? "—";
    const proj = t?.client_entities?.projects;
    const firm = proj?.firms;
    const actor = r.actor_id ? (actorMap.get(r.actor_id) ?? "Someone") : "System";
    const desc = describePayload(r.event_type, r.payload);

    const cell = (key: ColKey) => {
      switch (key) {
        case "timestamp":
          return (
            <div className="leading-tight">
              <div className="font-mono text-[11px]">{fmtIST(r.created_at)}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {fmtEST(r.created_at)}
              </div>
            </div>
          );
        case "event":
          return (
            <Badge variant="secondary" className={`${meta.tone} gap-1`}>
              <Icon className="h-3 w-3" />
              <span className="text-[10px]">{meta.label}</span>
            </Badge>
          );
        case "actor":
          return (
            <span className="truncate" title={actor}>
              {actor}
            </span>
          );
        case "task":
          return (
            <div className="min-w-0">
              <Link
                to="/ops/tasks/$taskId"
                params={{ taskId: r.task_id }}
                className="block truncate font-medium text-primary hover:underline"
                title={taskTitle}
              >
                {taskTitle}
              </Link>
              {desc && (
                <div className="truncate text-[10px] text-muted-foreground" title={desc}>
                  {desc}
                </div>
              )}
            </div>
          );
        case "firm":
          return firm ? (
            <FirmCode code={firm.firm_identifier} name={firm.name} />
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        case "project":
          return proj ? (
            <ProjectCode code={proj.code} name={proj.name} />
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        default:
          return null;
      }
    };

    return (
      <div
        key={r.id}
        className="grid items-center border-b text-xs hover:bg-muted/30 min-h-[36px]"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {visibleCols.map((c) => (
          <div key={c.key} className="px-2 py-1 border-r min-w-0 flex items-center">
            {cell(c.key)}
          </div>
        ))}
      </div>
    );
  };

  const renderGroupHeader = (g: { key: string; label: string; rows: AuditRow[] }) => {
    const collapsed = !!grid.collapsed[g.key];
    return (
      <button
        type="button"
        onClick={() =>
          setGrid((g0) => ({ ...g0, collapsed: { ...g0.collapsed, [g.key]: !collapsed } }))
        }
        className="w-full grid items-center bg-muted/40 hover:bg-muted/60 border-b border-t text-[11px] font-medium h-7 px-2 gap-2"
        style={{ gridTemplateColumns: "24px minmax(180px,1fr) auto" }}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        <span className="truncate text-left">{g.label || "—"}</span>
        <span className="text-muted-foreground tabular-nums">{g.rows.length} events</span>
      </button>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Header strip */}
        <div className="flex items-center justify-between gap-3 px-4 h-12 border-b shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold leading-none">Activity Feed</h1>
              <Badge variant="outline" className="h-5 text-[10px]">
                {filtered.length}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-none mt-1 truncate">
              Immutable audit log · times in IST and EST
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <ColumnVisibilityPopover grid={grid} setGrid={setGrid} />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              title="Export CSV"
              aria-label="Export CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-2 shrink-0">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Task, actor, payload…"
            onClearAll={hasFilters ? clearFilters : undefined}
            filters={[
              {
                id: "event",
                label: "Event",
                kind: "custom",
                activeCount: eventFilter !== "all" ? 1 : 0,
                render: () => (
                  <FacetedSingleChip
                    icon={<Tag className="h-3 w-3" />}
                    label="Event"
                    options={eventOptions}
                    value={eventFilter}
                    emptyValue="all"
                    onChange={setEventFilter}
                    counts={facets.event}
                  />
                ),
              },
              ...(isAdmin
                ? [
                    {
                      id: "actor",
                      label: "Actor",
                      kind: "custom" as const,
                      activeCount: actorFilter !== "all" ? 1 : 0,
                      render: () => (
                        <FacetedSingleChip
                          icon={<UserIcon className="h-3 w-3" />}
                          label="Actor"
                          options={actorOptions}
                          value={actorFilter}
                          emptyValue="all"
                          onChange={setActorFilter}
                          counts={facets.actor}
                        />
                      ),
                    },
                  ]
                : []),
              {
                id: "firm",
                label: "Firm",
                kind: "custom",
                activeCount: firmFilter !== "all" ? 1 : 0,
                render: () => (
                  <FacetedSingleChip
                    icon={<Building2 className="h-3 w-3" />}
                    label="Firm"
                    options={firmOptions}
                    value={firmFilter}
                    emptyValue="all"
                    onChange={setFirmFilter}
                    counts={facets.firm}
                  />
                ),
              },
              {
                id: "date",
                label: "Date",
                kind: "custom",
                activeCount: from || to ? 1 : 0,
                render: () => <DateRangePicker value={range} onChange={setRange} />,
              },
              {
                id: "groupby",
                label: "Group by",
                kind: "custom",
                activeCount: grid.groupBy !== "none" ? 1 : 0,
                render: () => (
                  <FacetedSingleChip
                    icon={<Layers className="h-3 w-3" />}
                    label="Group by"
                    value={grid.groupBy}
                    emptyValue="none"
                    onChange={(v) => setGrid((g) => ({ ...g, groupBy: v as GroupKey }))}
                    options={[
                      { value: "none", label: "None" },
                      { value: "event", label: "Event" },
                      { value: "actor", label: "Actor" },
                      { value: "firm", label: "Firm" },
                      { value: "project", label: "Project" },
                      { value: "day", label: "Day" },
                      { value: "week", label: "Week" },
                    ]}
                  />
                ),
              },
            ]}
            actions={
              isAdmin ? (
                <Tabs value={view} onValueChange={(v) => setView(v as "mine" | "everyone")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="mine" className="text-xs h-7 px-3">
                      Mine
                    </TabsTrigger>
                    <TabsTrigger value="everyone" className="text-xs h-7 px-3">
                      Everyone
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : null
            }
          />
        </div>

        {/* Grid */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isError ? (
            <GridErrorState error={error} onRetry={() => void refetch()} />
          ) : isLoading ? (
            <GridSkeletonRows rows={12} />
          ) : filtered.length === 0 ? (
            <div className="p-10">
              <EmptyState
                icon={<ActivityIcon className="h-10 w-10" />}
                title="No activity matches"
                description="Try clearing filters or expanding the date range."
              />
            </div>
          ) : groups ? (
            <div className="h-full overflow-auto">
              <div
                className="grid sticky top-0 z-10 bg-muted/60 backdrop-blur border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {visibleCols.map((c) => (
                  <ColumnHeader key={c.key} col={c} grid={grid} setGrid={setGrid} />
                ))}
              </div>
              {groups.map((g) => (
                <div key={g.key}>
                  {renderGroupHeader(g)}
                  {!grid.collapsed[g.key] && g.rows.map(renderRow)}
                </div>
              ))}
              {hasNextPage && (
                <div className="px-3 py-2 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEndReached}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <VirtualRows
              rows={filtered}
              estimateRowHeight={36}
              rowKey={(r) => r.id}
              onEndReached={handleEndReached}
              topSlot={
                <div
                  className="grid sticky top-0 z-10 bg-muted/60 backdrop-blur border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  {visibleCols.map((c) => (
                    <ColumnHeader key={c.key} col={c} grid={grid} setGrid={setGrid} />
                  ))}
                </div>
              }
              bottomSlot={
                isFetchingNextPage ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground text-center">
                    Loading more…
                  </div>
                ) : !hasNextPage && filtered.length > 0 ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground text-center">
                    End of log
                  </div>
                ) : null
              }
              renderRow={(r) => renderRow(r)}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ───────── Column header with sort, filter, resize ─────────
function ColumnHeader({
  col,
  grid,
  setGrid,
}: {
  col: ColDef;
  grid: GridState;
  setGrid: React.Dispatch<React.SetStateAction<GridState>>;
}) {
  const sortDir = grid.sort?.key === col.key ? grid.sort.dir : null;
  const fval = grid.filters[col.key] ?? {};
  const filterActive = !!fval.text?.trim();

  const cycleSort = () => {
    if (!col.sortable) return;
    setGrid((g) => {
      if (g.sort?.key !== col.key) return { ...g, sort: { key: col.key, dir: "asc" } };
      if (g.sort.dir === "asc") return { ...g, sort: { key: col.key, dir: "desc" } };
      return { ...g, sort: null };
    });
  };

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = grid.widths[col.key];
    const move = (ev: MouseEvent) => {
      const w = Math.max(col.minWidth, startW + (ev.clientX - startX));
      setGrid((g) => ({ ...g, widths: { ...g.widths, [col.key]: w } }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onResizeReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGrid((g) => ({ ...g, widths: { ...g.widths, [col.key]: col.defaultWidth } }));
  };

  return (
    <div className="relative px-2 py-1.5 border-r flex items-center gap-1 select-none group min-w-0">
      <button
        type="button"
        onClick={cycleSort}
        disabled={!col.sortable}
        className={cn(
          "truncate flex items-center gap-1 hover:text-foreground",
          col.sortable && "cursor-pointer",
        )}
      >
        <span className="truncate">{col.label}</span>
        {sortDir === "asc" && <ArrowUp className="h-3 w-3" />}
        {sortDir === "desc" && <ArrowDown className="h-3 w-3" />}
      </button>

      {col.filter && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "h-4 w-4 inline-flex items-center justify-center rounded hover:bg-muted opacity-0 group-hover:opacity-100",
                filterActive && "opacity-100 text-primary",
              )}
              aria-label="Filter column"
            >
              <FilterIcon className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2 space-y-2">
            <div className="text-[11px] font-medium normal-case">Filter {col.label}</div>
            <Input
              value={fval.text ?? ""}
              onChange={(e) =>
                setGrid((g) => ({
                  ...g,
                  filters: {
                    ...g.filters,
                    [col.key]: { ...g.filters[col.key], text: e.target.value },
                  },
                }))
              }
              placeholder="Contains…"
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-full text-xs"
              onClick={() =>
                setGrid((g) => {
                  const fn = { ...g.filters };
                  delete fn[col.key];
                  return { ...g, filters: fn };
                })
              }
            >
              Clear
            </Button>
          </PopoverContent>
        </Popover>
      )}

      <div
        onMouseDown={onResizeStart}
        onDoubleClick={onResizeReset}
        title="Drag to resize · Double-click to reset"
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
      />
    </div>
  );
}

// ───────── Column visibility popover ─────────
function ColumnVisibilityPopover({
  grid,
  setGrid,
}: {
  grid: GridState;
  setGrid: React.Dispatch<React.SetStateAction<GridState>>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title="Columns"
          aria-label="Columns"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <div className="text-[11px] font-medium mb-1">Columns</div>
        <ul className="space-y-1">
          {COLS.map((c) => (
            <li key={c.key} className="flex items-center gap-2">
              <Checkbox
                id={`acol-${c.key}`}
                checked={grid.visible[c.key]}
                disabled={c.alwaysVisible}
                onCheckedChange={(v) =>
                  setGrid((g) => ({ ...g, visible: { ...g.visible, [c.key]: !!v } }))
                }
              />
              <Label htmlFor={`acol-${c.key}`} className="text-xs font-normal cursor-pointer">
                {c.label}
              </Label>
            </li>
          ))}
        </ul>
        <div className="border-t mt-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-full text-xs"
            onClick={() =>
              setGrid((g) => ({
                ...g,
                widths: Object.fromEntries(COLS.map((c) => [c.key, c.defaultWidth])) as Record<
                  ColKey,
                  number
                >,
              }))
            }
          >
            Reset widths
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
