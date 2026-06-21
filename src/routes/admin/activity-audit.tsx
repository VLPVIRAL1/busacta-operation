import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Search,
  Download,
  MessageSquare,
  Clock as ClockIcon,
  Pencil,
  Flag,
  Filter,
  Building2,
  ListTodo,
  User as UserIcon,
  ArrowRightLeft,
  X,
  CalendarSearch,
  ScrollText,
  MonitorSmartphone,
  Bug,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { auditStaffQuery, auditFirmsQuery } from "@/lib/queries/admin.queries";
import { useAuth } from "@/lib/auth/auth-context";
import { AdminGuide } from "@/components/admin/admin-guide";
import { AdminTabBar, ViewTab } from "@/components/admin/admin-tabs";
import { SecurityAuditLogPage } from "./audit-log";
import { UserActivityPage } from "./user-activity";
import { PerformancePage } from "./performance";
import { ClientErrorsPage } from "./client-errors";

type ActivityTabKey = "user" | "log" | "login" | "performance" | "errors";
const ACTIVITY_TABS: ActivityTabKey[] = ["user", "log", "login", "performance", "errors"];

export const Route = createFileRoute("/admin/activity-audit")({
  validateSearch: (s: Record<string, unknown>): { tab: ActivityTabKey } => ({
    tab: ACTIVITY_TABS.includes(s.tab as ActivityTabKey) ? (s.tab as ActivityTabKey) : "user",
  }),
  component: () => (
    <AuthGuard allow={["super_admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin" }, { label: "Monitoring" }]}>
        <ActivityAuditContainer />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function ActivityAuditContainer() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<ActivityTabKey>(search.tab);

  const handleChange = (next: ActivityTabKey) => {
    setTab(next);
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title="Monitoring"
        description="Audit trails and live telemetry in one place — user activity, event log, sign-in history, route performance and client errors."
      />

      <AdminGuide pageName="activity-audit" className="mb-3 shrink-0">
        See who did what and how the app is performing. <strong>User activity</strong> searches
        every comment, edit, status change, open point and time entry. <strong>Event log</strong> is
        the chronological record of security fixes and system events. <strong>Login history</strong>{" "}
        lists sign-in events with device, IP and location. <strong>Performance</strong> shows
        TTFB/render timings per route, and <strong>Client errors</strong> captures browser
        JavaScript exceptions.
      </AdminGuide>

      <AdminTabBar>
        <ViewTab
          active={tab === "user"}
          onClick={() => handleChange("user")}
          icon={<CalendarSearch className="h-3.5 w-3.5" />}
          label="User activity"
        />
        <ViewTab
          active={tab === "log"}
          onClick={() => handleChange("log")}
          icon={<ScrollText className="h-3.5 w-3.5" />}
          label="Event log"
        />
        <ViewTab
          active={tab === "login"}
          onClick={() => handleChange("login")}
          icon={<MonitorSmartphone className="h-3.5 w-3.5" />}
          label="Login history"
        />
        <ViewTab
          active={tab === "performance"}
          onClick={() => handleChange("performance")}
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Performance"
        />
        <ViewTab
          active={tab === "errors"}
          onClick={() => handleChange("errors")}
          icon={<Bug className="h-3.5 w-3.5" />}
          label="Client errors"
        />
      </AdminTabBar>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
        {tab === "user" && <UserActivityAuditPage embedded />}
        {tab === "log" && <SecurityAuditLogPage embedded />}
        {tab === "login" && <UserActivityPage embedded />}
        {tab === "performance" && <PerformancePage embedded />}
        {tab === "errors" && <ClientErrorsPage embedded />}
      </div>
    </div>
  );
}

type ActivityKind = "comment" | "open_point" | "time" | "task_change";

type Item = {
  id: string;
  kind: ActivityKind;
  actorId: string;
  taskId: string | null;
  at: string;
  title: string;
  detail?: string;
  minutes?: number;
};

function startOfDay(d: string) {
  return `${d}T00:00:00`;
}
function endOfDay(d: string) {
  return `${d}T23:59:59.999`;
}
function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function UserActivityAuditPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const [from, setFrom] = useState(isoDate(-6));
  const [to, setTo] = useState(isoDate(0));
  const [userId, setUserId] = useState<string>("__me__");
  const [firmId, setFirmId] = useState<string>("__all__");
  const [kindFilter, setKindFilter] = useState<"all" | ActivityKind>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const applyPreset = (f: Record<string, any>) => {
    if ("from" in f) setFrom(f.from ?? "");
    if ("to" in f) setTo(f.to ?? "");
    if ("userId" in f) setUserId(f.userId ?? "__me__");
    if ("firmId" in f) setFirmId(f.firmId ?? "__all__");
    if ("kindFilter" in f) setKindFilter(f.kindFilter ?? "all");
    if ("search" in f) setSearch(f.search ?? "");
    if ("sort" in f) setSort(f.sort ?? "newest");
  };

  const targetUser =
    userId === "__all__" ? null : userId === "__me__" ? (user?.id ?? null) : userId;

  const { data: staff } = useQuery(auditStaffQuery());
  const { data: firms } = useQuery(auditFirmsQuery());

  const { data: bundle, isLoading } = useQuery({
    queryKey: ["activity-audit", from, to, targetUser ?? "all"],
    queryFn: async () => {
      const start = startOfDay(from);
      const end = endOfDay(to);
      const userFilter = targetUser ?? null;

      const msgsQ = supabase
        .from("task_messages")
        .select("id, body, task_id, author_id, created_at, edited_at, is_pinned")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (userFilter) msgsQ.eq("author_id", userFilter);

      const timeQ = supabase
        .from("time_logs")
        .select("id, task_id, user_id, duration_minutes, started_at, ended_at, note")
        .gte("started_at", start)
        .lte("started_at", end)
        .order("started_at", { ascending: false })
        .limit(1000);
      if (userFilter) timeQ.eq("user_id", userFilter);

      const auditQ = supabase
        .from("task_audit")
        .select("id, task_id, actor_id, event_type, payload, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (userFilter) auditQ.eq("actor_id", userFilter);

      const [msgs, time, audits] = await Promise.all([msgsQ, timeQ, auditQ]);

      const taskIds = Array.from(
        new Set(
          [
            ...(msgs.data ?? []).map((m) => m.task_id),
            ...(time.data ?? []).map((t) => t.task_id),
            ...(audits.data ?? []).map((a) => a.task_id),
          ].filter(Boolean) as string[],
        ),
      );

      type Ctx = {
        taskTitle: string;
        entityName: string;
        projectName: string;
        firmId: string;
        firmName: string;
      };
      const ctx = new Map<string, Ctx>();
      if (taskIds.length) {
        const { data: tRows } = await supabase
          .from("tasks")
          .select(
            "id, title, client_entities!inner(name, projects!inner(name, firm_id, firms(name)))",
          )
          .in("id", taskIds);
        for (const t of tRows ?? []) {
          const ent: any = (t as any).client_entities;
          ctx.set(t.id as string, {
            taskTitle: (t as { title: string }).title,
            entityName: ent?.name ?? "—",
            projectName: ent?.projects?.name ?? "—",
            firmId: ent?.projects?.firm_id ?? "",
            firmName: ent?.projects?.firms?.name ?? "—",
          });
        }
      }

      const actorIds = Array.from(
        new Set([
          ...(msgs.data ?? []).map((m) => m.author_id),
          ...(time.data ?? []).map((t) => t.user_id),
          ...((audits.data ?? []).map((a) => a.actor_id).filter(Boolean) as string[]),
        ]),
      );
      const actors = new Map<string, { full_name: string | null; email: string | null }>();
      if (actorIds.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", actorIds);
        for (const p of data ?? []) actors.set(p.id, { full_name: p.full_name, email: p.email });
      }

      const items: Item[] = [];
      for (const m of msgs.data ?? []) {
        items.push({
          id: `msg-${m.id}`,
          kind: "comment",
          actorId: m.author_id,
          taskId: m.task_id,
          at: m.created_at,
          title: m.edited_at ? "Edited comment" : "Comment",
          detail: (m.body || "").replace(/\s+/g, " ").trim(),
        });
      }
      for (const t of time.data ?? []) {
        items.push({
          id: `time-${t.id}`,
          kind: "time",
          actorId: t.user_id,
          taskId: t.task_id,
          at: t.started_at,
          title: `${t.duration_minutes ?? 0} min logged`,
          detail: t.note ?? undefined,
          minutes: t.duration_minutes ?? 0,
        });
      }
      for (const a of audits.data ?? []) {
        const p: any = a.payload ?? {};
        let detail = "";
        if (p && p.from !== undefined && p.to !== undefined)
          detail = `${p.from ?? "—"} → ${p.to ?? "—"}`;
        items.push({
          id: `aud-${a.id}`,
          kind: "task_change",
          actorId: a.actor_id ?? "",
          taskId: a.task_id,
          at: a.created_at,
          title: a.event_type.replace(/_/g, " "),
          detail,
        });
      }

      return { items, ctx, actors };
    },
  });

  const ctx = bundle?.ctx ?? new Map();
  const actors = bundle?.actors ?? new Map();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (bundle?.items ?? []).filter((it) => {
      if (kindFilter !== "all" && it.kind !== kindFilter) return false;
      if (firmId !== "__all__") {
        const c = it.taskId ? ctx.get(it.taskId) : null;
        if (!c || c.firmId !== firmId) return false;
      }
      if (q) {
        const c = it.taskId ? ctx.get(it.taskId) : null;
        const a = actors.get(it.actorId);
        const hay = [
          it.title,
          it.detail ?? "",
          c?.taskTitle ?? "",
          c?.firmName ?? "",
          c?.projectName ?? "",
          c?.entityName ?? "",
          a?.full_name ?? "",
          a?.email ?? "",
        ]
          .join(" \u0001 ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort((x, y) =>
      sort === "newest"
        ? new Date(y.at).getTime() - new Date(x.at).getTime()
        : new Date(x.at).getTime() - new Date(y.at).getTime(),
    );
    return list;
  }, [bundle, kindFilter, firmId, search, sort, ctx, actors]);

  const totals = useMemo(() => {
    const out = { comment: 0, open_point: 0, time: 0, task_change: 0, minutes: 0 };
    for (const it of filtered) {
      out[it.kind] += 1;
      if (it.kind === "time") out.minutes += it.minutes ?? 0;
    }
    return out;
  }, [filtered]);

  const exportCsv = () => {
    const headers = [
      "When",
      "Type",
      "Actor",
      "Firm",
      "Project",
      "Entity",
      "Task",
      "Title",
      "Detail",
      "Minutes",
    ];
    const lines = [
      headers,
      ...filtered.map((it) => {
        const c = it.taskId ? ctx.get(it.taskId) : null;
        const a = actors.get(it.actorId);
        return [
          new Date(it.at).toLocaleString(),
          it.kind,
          a?.full_name ?? a?.email ?? it.actorId,
          c?.firmName ?? "",
          c?.projectName ?? "",
          c?.entityName ?? "",
          c?.taskTitle ?? "",
          it.title,
          it.detail ?? "",
          it.minutes != null ? String(it.minutes) : "",
        ];
      }),
    ];
    const csv = lines
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setKindFilter("all");
    setFirmId("__all__");
    setSearch("");
    setSort("newest");
    setUserId("__me__");
    setFrom(isoDate(-6));
    setTo(isoDate(0));
  };

  const exportBtn = (
    <Button
      variant="outline"
      size="icon"
      className="h-9 w-9"
      onClick={exportCsv}
      disabled={filtered.length === 0}
      title="Export CSV"
      aria-label="Export CSV"
    >
      <Download className="h-4 w-4" />
    </Button>
  );

  const content = (
    <>
      {/* Filter bar */}
      <Card className="glass border-border-subtle">
        <CardContent className="p-3 grid gap-2 md:grid-cols-2 lg:grid-cols-12 items-end">
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              From
            </label>
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">To</label>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              User
            </label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__me__">Me</SelectItem>
                {isAdmin && <SelectItem value="__all__">All staff</SelectItem>}
                {(staff ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Firm
            </label>
            <Select value={firmId} onValueChange={setFirmId}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__all__">All firms</SelectItem>
                {(firms ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Type
            </label>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity</SelectItem>
                <SelectItem value="comment">Comments</SelectItem>
                <SelectItem value="open_point">Open points</SelectItem>
                <SelectItem value="time">Time logs</SelectItem>
                <SelectItem value="task_change">Task changes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2 space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Sort
            </label>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-10 space-y-1">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search task, firm, body, note…"
                className="h-9 pl-7"
              />
            </div>
          </div>
          <div className="lg:col-span-2 flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">
              <X className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
        <StatTile
          icon={<Filter className="h-4 w-4" />}
          label="Results"
          value={String(filtered.length)}
        />
        <StatTile
          icon={<MessageSquare className="h-4 w-4" />}
          label="Comments"
          value={String(totals.comment)}
        />
        <StatTile
          icon={<Flag className="h-4 w-4" />}
          label="Open points"
          value={String(totals.open_point)}
        />
        <StatTile
          icon={<ClockIcon className="h-4 w-4" />}
          label="Time"
          value={`${(totals.minutes / 60).toFixed(1)}h`}
        />
        <StatTile
          icon={<ArrowRightLeft className="h-4 w-4" />}
          label="Task changes"
          value={String(totals.task_change)}
        />
      </div>

      {/* Timeline */}
      <Card className="glass border-border-subtle mt-3">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-10 w-10" />}
              title="No activity for this filter"
              description="Widen the date range or clear filters."
            />
          ) : (
            <ul className="divide-y">
              {filtered.map((it) => {
                const c = it.taskId ? ctx.get(it.taskId) : null;
                const a = actors.get(it.actorId);
                return (
                  <li key={it.id} className="p-3 hover:bg-muted/40 transition-colors">
                    <div className="flex items-start gap-3">
                      <KindIcon kind={it.kind} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline" className="gap-1 capitalize">
                            {it.kind.replace("_", " ")}
                          </Badge>
                          <span className="font-medium truncate">{it.title}</span>
                          <span className="text-muted-foreground tabular-nums ml-auto">
                            {new Date(it.at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {it.detail && <p className="text-sm mt-1 line-clamp-2">{it.detail}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <UserIcon className="h-3 w-3" />
                            {a?.full_name ?? a?.email ?? it.actorId.slice(0, 8)}
                          </span>
                          {c && (
                            <>
                              <span>·</span>
                              {c.firmId ? (
                                <Link
                                  to="/ops/firms/$firmId"
                                  params={{ firmId: c.firmId }}
                                  className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                                >
                                  <Building2 className="h-3 w-3" />
                                  {c.firmName}
                                </Link>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {c.firmName}
                                </span>
                              )}
                              <span>·</span>
                              <span>{c.projectName}</span>
                              <span>·</span>
                              <span>{c.entityName}</span>
                              <span>·</span>
                              <Link
                                to="/ops/tasks/$taskId"
                                params={{ taskId: it.taskId! }}
                                className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline"
                              >
                                <ListTodo className="h-3 w-3" />
                                {c.taskTitle}
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );

  if (embedded) {
    return (
      <div>
        <div className="mb-3 flex justify-end">{exportBtn}</div>
        {content}
      </div>
    );
  }

  return (
    <AuthGuard allow={["admin", "employee"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin/team" }, { label: "User activity audit" }]}>
        <PageHeader
          title="User activity audit"
          description="Search every comment, edit, status change, open point and time entry — filtered by user, firm, type and date."
          actions={exportBtn}
        />
        {content}
      </AppShell>
    </AuthGuard>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="glass border-border-subtle">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="rounded-md border bg-background p-1.5 text-muted-foreground">{icon}</div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function KindIcon({ kind }: { kind: ActivityKind }) {
  const cls = "h-4 w-4";
  const wrap = "rounded-md border p-1.5 shrink-0";
  if (kind === "comment")
    return (
      <div
        className={`${wrap} bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300`}
      >
        <MessageSquare className={cls} />
      </div>
    );
  if (kind === "open_point")
    return (
      <div
        className={`${wrap} bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300`}
      >
        <Flag className={cls} />
      </div>
    );
  if (kind === "time")
    return (
      <div
        className={`${wrap} bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300`}
      >
        <ClockIcon className={cls} />
      </div>
    );
  return (
    <div
      className={`${wrap} bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300`}
    >
      <Pencil className={cls} />
    </div>
  );
}
