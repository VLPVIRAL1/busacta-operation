import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Download,
  FolderKanban,
  ClipboardList,
  User as UserIcon,
  Layers,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { EffectiveEditPopover } from "@/components/shared/effective-edit-popover";
import { FacetedSingleChip } from "@/components/shared/faceted-multi-chip";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { fmtIST } from "@/lib/format/time";
import { formatEntityDisplayName, isHiddenDefaultEntity } from "@/lib/shared/domain";
import {
  firmTimesheetLogsQuery,
  profilesByIdsQuery,
  type FirmTimesheetLogRow as LogRow,
} from "@/lib/queries/ops.queries";
import { FirmActivityPanel } from "@/components/ops/firm-activity-panel";

export const Route = createFileRoute("/ops/firms/$firmId/timesheet")({
  component: FirmWorkLogPage,
  errorComponent: RouteErrorComponent,
});

type GroupBy = "none" | "user" | "project" | "task" | "day" | "week";

const effMins = (l: LogRow) =>
  l.effective_override ??
  l.effective_minutes ??
  Math.max(0, (l.duration_minutes ?? 0) - (l.break_minutes ?? 0));

function startOfWeekISO() {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function FirmWorkLogPage() {
  const { firmId } = Route.useParams();
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "employee";

  const [range, setRange] = useState<{ from?: string; to?: string }>({
    from: startOfWeekISO(),
    to: new Date().toISOString().slice(0, 10),
  });
  const from = range.from ?? startOfWeekISO();
  const to = range.to ?? new Date().toISOString().slice(0, 10);
  const [projectFilter, setProjectFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { data: logs, isLoading } = useQuery(firmTimesheetLogsQuery(firmId, from, to));
  const userIds = useMemo(() => Array.from(new Set((logs ?? []).map((l) => l.user_id))), [logs]);
  const { data: users } = useQuery(profilesByIdsQuery(userIds));

  const projectOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs ?? []) {
      const p = l.tasks?.client_entities?.projects;
      if (p?.id) m.set(p.id, p.name);
    }
    return Array.from(m, ([id, name]) => ({ value: id, label: name }));
  }, [logs]);

  const taskOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs ?? []) {
      if (projectFilter !== "all" && l.tasks?.client_entities?.projects?.id !== projectFilter)
        continue;
      if (l.tasks?.id) m.set(l.tasks.id, l.tasks.title);
    }
    return Array.from(m, ([id, name]) => ({ value: id, label: name }));
  }, [logs, projectFilter]);

  const userOptions = useMemo(() => {
    const ids = new Set((logs ?? []).map((l) => l.user_id));
    return Array.from(ids).map((id) => {
      const u = users?.[id];
      return { value: id, label: u?.full_name || u?.email || id.slice(0, 6) };
    });
  }, [logs, users]);

  const filtered = useMemo(() => {
    return (logs ?? []).filter((l) => {
      if (projectFilter !== "all" && l.tasks?.client_entities?.projects?.id !== projectFilter)
        return false;
      if (taskFilter !== "all" && l.tasks?.id !== taskFilter) return false;
      if (userFilter !== "all" && l.user_id !== userFilter) return false;
      return true;
    });
  }, [logs, projectFilter, taskFilter, userFilter]);

  const totals = useMemo(() => {
    let total = 0,
      effective = 0;
    filtered.forEach((l) => {
      total += l.duration_minutes ?? 0;
      effective += effMins(l);
    });
    return { total, effective, breaks: total - effective };
  }, [filtered]);

  const userName = (uid: string) => {
    const u = users?.[uid];
    return u?.full_name || u?.email || uid.slice(0, 6);
  };

  const groupKey = (l: LogRow): { key: string; label: string } => {
    const p = l.tasks?.client_entities?.projects;
    switch (groupBy) {
      case "user":
        return { key: l.user_id, label: userName(l.user_id) };
      case "project":
        return { key: p?.id ?? "—", label: p?.name ?? "—" };
      case "task":
        return { key: l.tasks?.id ?? "—", label: l.tasks?.title ?? "—" };
      case "day":
        return {
          key: new Date(l.started_at).toISOString().slice(0, 10),
          label: new Date(l.started_at).toLocaleDateString(),
        };
      case "week": {
        const d = new Date(l.started_at);
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
    if (groupBy === "none") return null;
    const m = new Map<string, { label: string; rows: LogRow[] }>();
    for (const r of filtered) {
      const g = groupKey(r);
      if (!m.has(g.key)) m.set(g.key, { label: g.label, rows: [] });
      m.get(g.key)!.rows.push(r);
    }
    return Array.from(m, ([key, v]) => ({ key, label: v.label, rows: v.rows }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, groupBy, users]);

  const hasFilters =
    projectFilter !== "all" || taskFilter !== "all" || userFilter !== "all" || groupBy !== "none";
  const clearAll = () => {
    setProjectFilter("all");
    setTaskFilter("all");
    setUserFilter("all");
    setGroupBy("none");
  };

  // Restrict activity to filtered task IDs (when narrowed) and users (when narrowed)
  const activityTaskIds = useMemo(() => {
    if (projectFilter === "all" && taskFilter === "all" && userFilter === "all") return null;
    return Array.from(new Set(filtered.map((l) => l.tasks?.id).filter(Boolean) as string[]));
  }, [filtered, projectFilter, taskFilter, userFilter]);
  const activityActorIds = useMemo(
    () => (userFilter === "all" ? null : [userFilter]),
    [userFilter],
  );

  function exportCsv() {
    const rows = [
      ["Date", "User", "Project", "Client", "Task", "Note", "Tracked", "Effective"],
      ...filtered.map((l) => [
        new Date(l.started_at).toISOString().slice(0, 10),
        userName(l.user_id),
        l.tasks?.client_entities?.projects?.name ?? "",
        l.tasks?.client_entities?.name ?? "",
        l.tasks?.title ?? "",
        (l.note ?? "").replace(/[\n\r,]/g, " "),
        ((l.duration_minutes ?? 0) / 60).toFixed(2),
        (effMins(l) / 60).toFixed(2),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `firm-worklog-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Grid template like Time Logs page
  const cols: { key: string; label: string; width: string; align?: "right" }[] = [
    { key: "date", label: "Date", width: "130px" },
    { key: "user", label: "User", width: "120px" },
    { key: "project", label: "Project · Client", width: "minmax(180px,1fr)" },
    { key: "task", label: "Task", width: "minmax(180px,1.2fr)" },
    { key: "tracked", label: "Tracked", width: "90px", align: "right" },
    { key: "effective", label: "Effective", width: "100px", align: "right" },
    { key: "effpct", label: "Eff%", width: "70px", align: "right" },
    { key: "note", label: "Note", width: "minmax(160px,1fr)" },
  ];
  if (canEdit) cols.push({ key: "edit", label: "", width: "36px" });
  const gridTemplate = cols.map((c) => c.width).join(" ");

  const renderRow = (l: LogRow) => {
    const tracked = l.duration_minutes ?? 0;
    const eff = effMins(l);
    const effPct = tracked > 0 ? Math.min(100, Math.round((eff / tracked) * 100)) : 0;
    return (
      <div
        key={l.id}
        className="grid border-b border-border-subtle hover:bg-muted/30 transition-colors text-xs h-9 items-stretch"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div className="px-2 border-r border-border-subtle flex items-center min-w-0">
          <span className="font-mono tabular-nums truncate">{fmtIST(l.started_at)}</span>
        </div>
        <div className="px-2 border-r border-border-subtle flex items-center min-w-0">
          <span className="truncate">{userName(l.user_id)}</span>
        </div>
        <div className="px-2 border-r border-border-subtle flex items-center min-w-0">
          <span className="truncate">
            {l.tasks?.client_entities?.projects?.name}
            {l.tasks?.client_entities?.name &&
              !isHiddenDefaultEntity(l.tasks.client_entities.name) &&
              ` · ${formatEntityDisplayName(l.tasks.client_entities.name)}`}
          </span>
        </div>
        <div className="px-2 border-r border-border-subtle flex items-center min-w-0">
          <span className="truncate">{l.tasks?.title}</span>
        </div>
        <div className="px-2 border-r border-border-subtle flex items-center justify-end">
          <span className="font-mono tabular-nums">{(tracked / 60).toFixed(2)}h</span>
        </div>
        <div className="px-2 border-r border-border-subtle flex items-center justify-end">
          <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-300 font-medium">
            {(eff / 60).toFixed(2)}h
          </span>
        </div>
        <div className="px-2 border-r border-border-subtle flex items-center justify-end">
          <Badge
            variant="outline"
            className={cn(
              "h-5 px-1 text-[10px] tabular-nums",
              effPct >= 85 &&
                "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
              effPct >= 60 &&
                effPct < 85 &&
                "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30",
              effPct < 60 &&
                "border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30",
            )}
          >
            {effPct}%
          </Badge>
        </div>
        <div className="px-2 border-r border-border-subtle flex items-center min-w-0">
          <span className="truncate text-muted-foreground" title={l.note ?? ""}>
            {l.note ?? "—"}
          </span>
        </div>
        {canEdit && (
          <div className="px-1 flex items-center justify-center">
            <EffectiveEditPopover
              logId={l.id}
              durationMinutes={l.duration_minutes ?? 0}
              breakMinutes={l.break_minutes ?? 0}
              effectiveOverride={l.effective_override}
              invalidateKeys={[["firm-timesheet", firmId, from, to]]}
            />
          </div>
        )}
      </div>
    );
  };

  const renderGroupHeader = (g: { key: string; label: string; rows: LogRow[] }) => {
    const isCollapsed = !!collapsed[g.key];
    const gTracked = g.rows.reduce((s, l) => s + (l.duration_minutes ?? 0), 0);
    const gEff = g.rows.reduce((s, l) => s + effMins(l), 0);
    const gPct = gTracked > 0 ? Math.round((gEff / gTracked) * 100) : 0;
    return (
      <button
        type="button"
        onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !isCollapsed }))}
        className="w-full grid items-center bg-muted/40 hover:bg-muted/60 border-b border-t border-border-subtle text-[11px] font-medium h-7 px-2 gap-2"
        style={{ gridTemplateColumns: "24px minmax(180px,1fr) auto auto auto" }}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        <span className="truncate text-left">{g.label || "—"}</span>
        <span className="text-muted-foreground tabular-nums">{g.rows.length} rows</span>
        <span className="tabular-nums">{(gTracked / 60).toFixed(1)}h tracked</span>
        <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
          {(gEff / 60).toFixed(1)}h eff · {gPct}%
        </span>
      </button>
    );
  };

  const leftPane = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Filter strip + totals */}
      <Card className="border-border-subtle bg-background shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <DateRangePicker
              value={range}
              onChange={setRange}
              className="w-[230px] h-7"
              placeholder="Date range"
            />
            <FacetedSingleChip
              icon={<FolderKanban className="h-3 w-3" />}
              label="Project"
              value={projectFilter}
              emptyValue="all"
              onChange={(v) => {
                setProjectFilter(v);
                setTaskFilter("all");
              }}
              options={[{ value: "all", label: "All projects" }, ...projectOptions]}
            />
            <FacetedSingleChip
              icon={<ClipboardList className="h-3 w-3" />}
              label="Task"
              value={taskFilter}
              emptyValue="all"
              onChange={setTaskFilter}
              options={[{ value: "all", label: "All tasks" }, ...taskOptions]}
            />
            <FacetedSingleChip
              icon={<UserIcon className="h-3 w-3" />}
              label="User"
              value={userFilter}
              emptyValue="all"
              onChange={setUserFilter}
              options={[{ value: "all", label: "Anyone" }, ...userOptions]}
            />
            <FacetedSingleChip
              icon={<Layers className="h-3 w-3" />}
              label="Group by"
              value={groupBy}
              emptyValue="none"
              onChange={(v) => setGroupBy(v as GroupBy)}
              options={[
                { value: "none", label: "None" },
                { value: "user", label: "User" },
                { value: "project", label: "Project" },
                { value: "task", label: "Task" },
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
              ]}
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearAll}>
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
            <div className="ml-auto flex items-center gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Tracked </span>
                <span className="font-semibold tabular-nums">
                  {(totals.total / 60).toFixed(2)}h
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Effective </span>
                <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {(totals.effective / 60).toFixed(2)}h
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Breaks </span>
                <span className="font-semibold tabular-nums text-muted-foreground">
                  {(totals.breaks / 60).toFixed(2)}h
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={exportCsv}
                disabled={filtered.length === 0}
                title="Export CSV"
                aria-label="Export CSV"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      <div className="flex-1 min-h-0 rounded-xl border border-border-subtle bg-background shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title="No time logged"
              description="Time entries for this firm in the selected range will appear here."
            />
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <div
              className="grid sticky top-0 z-10 bg-muted/60 backdrop-blur border-b border-border-subtle text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {cols.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    "px-2 py-1.5 border-r border-border-subtle flex items-center min-w-0",
                    c.align === "right" && "justify-end",
                  )}
                >
                  <span className="truncate">{c.label}</span>
                </div>
              ))}
            </div>
            {groups
              ? groups.map((g) => (
                  <div key={g.key}>
                    {renderGroupHeader(g)}
                    {!collapsed[g.key] && g.rows.map(renderRow)}
                  </div>
                ))
              : filtered.map(renderRow)}
          </div>
        )}
      </div>
    </div>
  );

  const rightPane = (
    <Card className="h-full border-border-subtle bg-background shadow-sm">
      <CardContent className="flex h-full min-h-0 flex-col p-3">
        <FirmActivityPanel
          firmId={firmId}
          taskIds={activityTaskIds}
          actorIds={activityActorIds}
          compact
          title="Activity"
        />
      </CardContent>
    </Card>
  );

  return (
    <div className="h-full min-h-0">
      <ResizableTwoPane
        storageKey="firm-worklog"
        defaultLeft={80}
        minLeft={55}
        maxLeft={90}
        left={leftPane}
        right={rightPane}
        hideToolbar
      />
    </div>
  );
}
