import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  myTasksQuery,
  myTasksMultiQuery,
  taskMajorHead,
  MAJOR_HEAD_TO_METRIC,
  type DashboardMetric,
  type MyTaskRow,
} from "@/lib/queries/global-dashboard.queries";
import { Route as GlobalDashboardRoute } from "@/routes/global-dashboard";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { DashboardFilterBar } from "./dashboard-filter-bar";
import { RemindersPanel } from "./reminders-panel";
import { TaskTabsPane } from "./task-tabs-pane";
import { MyTasksList } from "./my-tasks-list";
import { WorkspaceKpiStrip } from "./workspace-kpi-strip";

// Counts roll tasks up by their pipeline major head (With BAT / With CPA /
// On Hold / Completed). "Total" is every task that isn't in a Completed stage.
function bucketMyTasks(rows: MyTaskRow[]): Record<DashboardMetric, number> {
  const counts: Record<DashboardMetric, number> = {
    total: 0,
    bat: 0,
    with_client: 0,
    on_hold: 0,
    completed: 0,
  };
  for (const r of rows) {
    const metric = MAJOR_HEAD_TO_METRIC[taskMajorHead(r)];
    counts[metric]++;
    if (metric !== "completed") counts.total++;
  }
  return counts;
}

export function TabWorkspace() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const search = GlobalDashboardRoute.useSearch();
  const navigate = useNavigate({ from: GlobalDashboardRoute.fullPath });

  const metric = search.metric as DashboardMetric | null;
  const period = search.period;
  const scope = search.scope;
  const usersFilter = search.users;
  const clientsFilter = search.clients;

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isMultiUser = usersFilter.length > 0;
  const { data: singleTasks = [], isLoading: singleLoading } = useQuery({
    ...myTasksQuery(userId),
    enabled: !isMultiUser && !!userId,
  });
  const { data: multiTasks = [], isLoading: multiLoading } = useQuery({
    ...myTasksMultiQuery(isMultiUser ? usersFilter : []),
    enabled: isMultiUser,
  });
  const tasks: MyTaskRow[] = isMultiUser ? multiTasks : singleTasks;
  const isLoading = isMultiUser ? multiLoading : singleLoading;

  const counts = useMemo(() => bucketMyTasks(tasks), [tasks]);

  // Filter options — derived from the loaded task set. Firm-linked tasks group
  // under their B2B Firm; direct-client tasks group under the B2C client.
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      const firm = t.client_entities?.projects?.firms;
      if (firm?.id) {
        map.set(`firm:${firm.id}`, firm.name ?? firm.firm_identifier ?? "Unknown firm");
      } else if (t.direct_client_id && t.direct_clients?.display_name) {
        map.set(`direct:${t.direct_client_id}`, t.direct_clients.display_name);
      }
    }
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [tasks]);

  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) });

  const selectMetric = (m: DashboardMetric) => setSearch({ metric: metric === m ? null : m });

  // ── Inner split: My Tasks | Task Detail ──────────────────────────────
  const innerLeft = (
    <MyTasksList
      selectedId={selectedId}
      onSelect={setSelectedId}
      metricFilter={metric}
      usersFilter={usersFilter}
      clientsFilter={clientsFilter}
    />
  );

  const innerRight = (
    <div className="h-full flex flex-col rounded-lg border overflow-hidden bg-card shadow-sm">
      {selectedId ? (
        <TaskTabsPane taskId={selectedId} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <div className="rounded-full bg-muted p-4">
            <svg
              className="h-6 w-6 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-muted-foreground">Select a task to see details</p>
        </div>
      )}
    </div>
  );

  // ── Outer left: filter + KPI + inner split ───────────────────────────
  const outerLeft = (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      {/* Filter bar + KPI strip — single row */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
        <DashboardFilterBar
          period={period}
          onPeriodChange={(p) => setSearch({ period: p })}
          scope={scope}
          onScopeChange={(s) => setSearch({ scope: s })}
          users={usersFilter}
          onUsersChange={(u) => setSearch({ users: u })}
          currentUserId={userId}
          clientOptions={clientOptions}
          clients={clientsFilter}
          onClientsChange={(c) => setSearch({ clients: c })}
        />
        <WorkspaceKpiStrip
          counts={counts}
          selected={metric}
          onSelect={selectMetric}
          loading={isLoading}
          compact
        />
      </div>

      {/* My Tasks | Task Detail — resizable inner split */}
      <div className="min-h-0 flex-1">
        <ResizableTwoPane
          storageKey="workspace-tasks-split"
          defaultLeft={32}
          minLeft={18}
          maxLeft={60}
          hideToolbar
          left={innerLeft}
          right={innerRight}
        />
      </div>
    </div>
  );

  // ── Outer right: Reminders full height ────────────────────────────────
  const outerRight = (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="flex shrink-0 items-center justify-between border-b bg-violet-500/10 px-3 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
          <Bell className="h-4 w-4" />
          Reminders
        </h2>
        <span className="text-xs text-muted-foreground">Personal &amp; shared</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {userId && <RemindersPanel userId={userId} />}
      </div>
    </section>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ResizableTwoPane
        storageKey="workspace-outer-split"
        defaultLeft={70}
        minLeft={45}
        maxLeft={85}
        hideToolbar
        left={outerLeft}
        right={outerRight}
      />
    </div>
  );
}
