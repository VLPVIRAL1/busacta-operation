import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { TimeLogsPage } from "./time-logs";
import { ActivityPage } from "./activity";
import { ProductivitySplitShell } from "@/components/ops/productivity/productivity-split-shell";
import { WorkloadBoard } from "@/components/ops/workload/workload-board";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { opsReportsQuery } from "@/lib/queries/ops.queries";
import { cn } from "@/lib/shared/utils";

const searchSchema = z.object({
  tab: z.enum(["reports", "time-logs", "productivity", "activity", "workload"]).default("reports"),
});

export const Route = createFileRoute("/ops/reports")({
  validateSearch: searchSchema,
  component: ReportsShell,
  errorComponent: RouteErrorComponent,
});

const REPORT_TABS = [
  { key: "reports", label: "Reports" },
  { key: "time-logs", label: "Time Logs" },
  { key: "productivity", label: "Productivity" },
  { key: "activity", label: "Activity" },
  { key: "workload", label: "Workload Board" },
] as const;

function ReportsShell() {
  const { tab } = useSearch({ from: "/ops/reports" });
  const navigate = useNavigate({ from: "/ops/reports" });

  const setTab = (t: string) =>
    navigate({
      search: (prev) => ({
        ...prev,
        tab: t as typeof tab,
      }),
      replace: true,
    });

  // The shell always runs fullBleed so the tab bar sits flush under the top
  // menu (the "Time Logs" look). Tabs that render plain page content get their
  // padding here instead; time-logs/activity manage their own layout.
  const needsPadding = tab === "reports" || tab === "productivity" || tab === "workload";

  return (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "Reports" }]} fullBleed>
        <div className="flex h-full min-h-0 flex-col">
          {/* Tab bar */}
          <div className="shrink-0 border-b bg-background px-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-10 bg-transparent gap-1 p-0 rounded-none">
                {REPORT_TABS.map((t) => (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none h-10 px-4 text-sm"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Tab content */}
          <div className={cn("flex-1 min-h-0 overflow-auto", needsPadding && "p-4 sm:p-6")}>
            {tab === "reports" && <ReportsPage />}
            {tab === "time-logs" && <TimeLogsPage />}
            {tab === "productivity" && <ProductivitySplitShell />}
            {tab === "activity" && <ActivityPage />}
            {tab === "workload" && <WorkloadBoard />}
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "hsl(220 14% 60%)",
  in_progress: "hsl(217 91% 60%)",
  ready_for_review: "hsl(280 70% 60%)",
  waiting_client: "hsl(38 92% 55%)",
  complete: "hsl(142 71% 45%)",
  on_hold: "hsl(0 84% 60%)",
};

function ReportsPage() {
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return { from: d.toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) };
  });

  const { data, isLoading } = useQuery(opsReportsQuery());

  const fromDate = dateRange.from ? new Date(dateRange.from + "T00:00:00") : null;
  const toDate = dateRange.to ? new Date(dateRange.to + "T23:59:59") : null;

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Reports" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (fromDate && t < fromDate.getTime()) return false;
    if (toDate && t > toDate.getTime()) return false;
    return true;
  };

  const profileById = new Map(data.profiles.map((p) => [p.id, p]));
  const filteredLogs = data.logs.filter((l) => inRange(l.started_at));
  const filteredTasks = data.tasks.filter((t) => inRange(t.created_at));

  // Hours by user
  const byUser = new Map<string, { total: number }>();
  for (const l of filteredLogs) {
    const cur = byUser.get(l.user_id) ?? { total: 0 };
    cur.total += l.duration_minutes ?? 0;
    byUser.set(l.user_id, cur);
  }
  const utilizationData = [...byUser.entries()]
    .map(([uid, v]) => {
      const p = profileById.get(uid);
      const capacity =
        (p as unknown as { weekly_capacity_hours?: number })?.weekly_capacity_hours ?? 40;
      const hours = +(v.total / 60).toFixed(1);
      return {
        name: p?.full_name?.split(" ")[0] || p?.email?.split("@")[0] || uid.slice(0, 6),
        hours,
        utilizationPct: capacity > 0 ? Math.round((hours / capacity) * 100) : 0,
      };
    })
    .sort((a, b) => b.hours - a.hours);

  // Task status distribution
  const statusCounts = new Map<string, number>();
  for (const t of filteredTasks) statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1);
  const statusData = [...statusCounts.entries()].map(([status, count]) => ({
    status: status.replace(/_/g, " "),
    key: status,
    count,
  }));

  // Priority distribution
  const priorityCounts = new Map<string, number>();
  for (const t of filteredTasks)
    priorityCounts.set(t.priority, (priorityCounts.get(t.priority) ?? 0) + 1);
  const priorityData = [...priorityCounts.entries()].map(([priority, count]) => ({
    priority,
    count,
  }));

  // TAT — overall completion
  const completed = filteredTasks.filter((t) => t.completed_at);
  const avgTatDays = completed.length
    ? completed.reduce(
        (s, t) =>
          s + (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / 86400000,
        0,
      ) / completed.length
    : 0;

  // TAT — through Internal QC (created → ready_for_review_at, OR pipeline reached internal_qc/qc_review/etc.)
  const qcStages = new Set([
    "internal_qc",
    "client_qc",
    "ready_for_delivery",
    "delivered",
    "signed_off",
  ]);
  const tasksReachedQc = filteredTasks.filter((t) => {
    const stage = (t as { pipeline_stage?: string | null }).pipeline_stage;
    return t.ready_for_review_at || (stage && qcStages.has(stage));
  });
  const qcTatDurations = tasksReachedQc
    .map((t) => {
      const reachedAt = t.ready_for_review_at
        ? new Date(t.ready_for_review_at).getTime()
        : t.completed_at
          ? new Date(t.completed_at).getTime()
          : null;
      if (!reachedAt) return null;
      return (reachedAt - new Date(t.created_at).getTime()) / 86400000;
    })
    .filter((v): v is number => v !== null && v >= 0);
  const avgQcTatDays = qcTatDurations.length
    ? qcTatDurations.reduce((a, b) => a + b, 0) / qcTatDurations.length
    : 0;
  const medianQcTatDays = qcTatDurations.length
    ? [...qcTatDurations].sort((a, b) => a - b)[Math.floor(qcTatDurations.length / 2)]
    : 0;

  // Per-user TAT-to-QC for offshore capacity view
  const tatByUser = new Map<string, number[]>();
  for (const t of tasksReachedQc) {
    if (!t.assignee_id) continue;
    const reachedAt = t.ready_for_review_at
      ? new Date(t.ready_for_review_at).getTime()
      : t.completed_at
        ? new Date(t.completed_at).getTime()
        : null;
    if (!reachedAt) continue;
    const days = (reachedAt - new Date(t.created_at).getTime()) / 86400000;
    if (days < 0) continue;
    const arr = tatByUser.get(t.assignee_id) ?? [];
    arr.push(days);
    tatByUser.set(t.assignee_id, arr);
  }
  const tatPerUserData = [...tatByUser.entries()]
    .map(([uid, days]) => {
      const p = profileById.get(uid);
      return {
        name: p?.full_name?.split(" ")[0] || p?.email?.split("@")[0] || uid.slice(0, 6),
        avgDays: +(days.reduce((a, b) => a + b, 0) / days.length).toFixed(1),
        tasks: days.length,
      };
    })
    .sort((a, b) => a.avgDays - b.avgDays);

  // Open Points by firm
  const projToFirm = new Map(data.projects.map((p) => [p.id, p.firm_id]));
  const openByFirm = new Map<string, number>();
  for (const t of filteredTasks) {
    if (t.status !== "waiting_client") continue;
    const projectId = (t as { client_entities?: { project_id: string } | null }).client_entities
      ?.project_id;
    const firmId = projectId ? projToFirm.get(projectId) : null;
    if (!firmId) continue;
    openByFirm.set(firmId, (openByFirm.get(firmId) ?? 0) + 1);
  }
  const openByFirmData = data.firms
    .map((f) => ({ firm: f.name, open: openByFirm.get(f.id) ?? 0 }))
    .sort((a, b) => b.open - a.open);

  // Project progress
  const tasksByProject = new Map<string, { total: number; done: number }>();
  for (const t of data.tasks) {
    const pid = (t as { client_entities?: { project_id: string } | null }).client_entities
      ?.project_id;
    if (!pid) continue;
    const cur = tasksByProject.get(pid) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (t.status === "complete") cur.done += 1;
    tasksByProject.set(pid, cur);
  }

  // Time trend by day
  const trendMap = new Map<string, number>();
  for (const l of filteredLogs) {
    if (!l.started_at) continue;
    const d = new Date(l.started_at).toISOString().slice(0, 10);
    trendMap.set(d, (trendMap.get(d) ?? 0) + (l.duration_minutes ?? 0));
  }
  const trendData = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, mins]) => ({ date: date.slice(5), hours: +(mins / 60).toFixed(1) }));

  const totalHours = filteredLogs.reduce((s, l) => s + (l.duration_minutes ?? 0), 0) / 60;

  const exportOpenPointsCsv = () => {
    const rows = [["Firm", "Open points"]];
    for (const r of openByFirmData) rows.push([r.firm, String(r.open)]);
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "open-points-by-firm.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Interactive analytics across utilization, throughput, and pipeline."
        actions={
          <DateRangePicker value={dateRange} onChange={setDateRange} className="w-[280px]" />
        }
      />

      {/* KPI tiles */}
      <div className="grid gap-3 md:grid-cols-4 mb-4">
        <KpiTile label="Total hours" value={totalHours.toFixed(1)} suffix="h" />
        <KpiTile label="TAT to QC (avg)" value={avgQcTatDays.toFixed(1)} suffix=" d" />
        <KpiTile label="Avg turnaround" value={avgTatDays.toFixed(1)} suffix=" days" />
        <KpiTile label="Tasks reached QC" value={String(tasksReachedQc.length)} />
      </div>

      <Tabs defaultValue="utilization" className="space-y-4">
        <TabsList>
          <TabsTrigger value="utilization">Utilization</TabsTrigger>
          <TabsTrigger value="tat">TAT</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="throughput">Throughput</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="utilization" className="space-y-4">
          <Card className="glass border-border-subtle">
            <CardHeader>
              <CardTitle className="text-base">Hours by user</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              {utilizationData.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={utilizationData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="hours" fill="hsl(217 91% 60%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-border-subtle">
            <CardHeader>
              <CardTitle className="text-base">Per-user totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {utilizationData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No time logged in this range.</p>
              ) : (
                utilizationData.map((u) => (
                  <div key={u.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{u.name}</span>
                      <span>{u.hours.toFixed(1)}h</span>
                    </div>
                    <Progress value={Math.min(100, u.hours)} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tat" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <KpiTile label="Tasks reached QC" value={String(tasksReachedQc.length)} />
            <KpiTile label="Avg days to QC" value={avgQcTatDays.toFixed(1)} suffix=" d" />
            <KpiTile label="Median days to QC" value={medianQcTatDays.toFixed(1)} suffix=" d" />
          </div>
          <Card className="glass border-border-subtle">
            <CardHeader>
              <CardTitle className="text-base">Avg days to Internal QC by assignee</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              {tatPerUserData.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tatPerUserData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      label={{
                        value: "days",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11 },
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Bar dataKey="avgDays" fill="hsl(217 91% 60%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card className="glass border-border-subtle">
            <CardHeader>
              <CardTitle className="text-base">Offshore capacity — tasks delivered to QC</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tatPerUserData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tasks have reached QC yet in this range.
                </p>
              ) : (
                tatPerUserData.map((u) => (
                  <div
                    key={u.name}
                    className="flex items-center justify-between text-sm border-b last:border-0 py-1.5"
                  >
                    <span className="font-medium">{u.name}</span>
                    <span className="text-muted-foreground">
                      <Badge variant="secondary" className="mr-2">
                        {u.tasks} tasks
                      </Badge>
                      {u.avgDays.toFixed(1)}d avg to QC
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="glass border-border-subtle">
              <CardHeader>
                <CardTitle className="text-base">Tasks by status</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {statusData.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="count"
                        nameKey="status"
                        innerRadius={50}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {statusData.map((s) => (
                          <Cell key={s.key} fill={STATUS_COLORS[s.key] ?? "hsl(220 14% 60%)"} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="glass border-border-subtle">
              <CardHeader>
                <CardTitle className="text-base">Tasks by priority</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {priorityData.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={priorityData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="priority" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(280 70% 60%)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="glass border-border-subtle">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Open points (waiting on client) by firm</CardTitle>
              <Button size="sm" variant="outline" onClick={exportOpenPointsCsv}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="h-[280px]">
              {openByFirmData.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={openByFirmData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="firm" tick={{ fontSize: 12 }} width={140} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Bar dataKey="open" fill="hsl(38 92% 55%)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="throughput" className="space-y-4">
          <Card className="glass border-border-subtle">
            <CardHeader>
              <CardTitle className="text-base">Hours logged over time</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              {trendData.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="hours"
                      stroke="hsl(217 91% 60%)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <Card className="glass border-border-subtle">
            <CardHeader>
              <CardTitle className="text-base">Project progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects yet.</p>
              ) : (
                data.projects.map((p) => {
                  const v = tasksByProject.get(p.id) ?? { total: 0, done: 0 };
                  const pct = v.total ? (v.done / v.total) * 100 : 0;
                  return (
                    <div key={p.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {v.done}/{v.total}
                          </Badge>
                          <span className="text-muted-foreground tabular-nums">
                            {Math.round(pct)}%
                          </span>
                        </span>
                      </div>
                      <Progress value={pct} />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function KpiTile({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <Card className="glass border-border-subtle">
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight text-gradient">
          {value}
          <span className="text-lg text-muted-foreground font-normal">{suffix}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      No data in this range.
    </div>
  );
}
