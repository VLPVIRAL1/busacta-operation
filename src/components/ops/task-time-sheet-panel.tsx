import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Download, Users, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { EffectiveEditPopover } from "@/components/shared/effective-edit-popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { DateRangePicker, type SimpleRange } from "@/components/shared/date-range-picker";

interface TLog {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  break_minutes: number;
  effective_minutes: number | null;
  effective_override: number | null;
  timer_group_size: number;
  note: string | null;
  subtask_id: string | null;
}

type GroupBy = "none" | "subtask" | "user";

function fmtDur(mins: number | null) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function csvEscape(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function TaskTimeSheetPanel({ taskId }: { taskId: string }) {
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "employee";
  const [subtaskFilter, setSubtaskFilter] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [dateRange, setDateRange] = useState<SimpleRange>({});

  const { data, isLoading } = useQuery({
    queryKey: ["task-time-sheet", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_logs")
        .select(
          "id, user_id, started_at, ended_at, duration_minutes, break_minutes, effective_minutes, effective_override, timer_group_size, note, subtask_id",
        )
        .eq("task_id", taskId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TLog[];
    },
  });

  const { data: task } = useQuery({
    queryKey: ["task-time-sheet-task", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("id", taskId)
        .maybeSingle();
      return data as { id: string; title: string } | null;
    },
  });
  const taskTitle = task?.title ?? "Task";

  const userIds = useMemo(() => Array.from(new Set((data ?? []).map((t) => t.user_id))), [data]);
  const { data: users } = useQuery({
    queryKey: ["ts-users", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
    },
  });

  const subtaskIds = useMemo(
    () =>
      Array.from(new Set((data ?? []).map((r) => r.subtask_id).filter((v): v is string => !!v))),
    [data],
  );
  const { data: subtaskTitles } = useQuery({
    queryKey: ["ts-subtasks", subtaskIds.join(",")],
    enabled: subtaskIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("task_subtasks")
        .select("id, title")
        .in("id", subtaskIds);
      return Object.fromEntries((data ?? []).map((s) => [s.id, (s as { title: string }).title]));
    },
  });

  const rangeFromTs = dateRange.from ? new Date(dateRange.from + "T00:00:00").getTime() : null;
  const rangeToTs = dateRange.to ? new Date(dateRange.to + "T23:59:59.999").getTime() : null;

  const filteredRows = useMemo(
    () =>
      (data ?? []).filter((r) => {
        if (subtaskFilter && r.subtask_id !== subtaskFilter) return false;
        const t = new Date(r.started_at).getTime();
        if (rangeFromTs !== null && t < rangeFromTs) return false;
        if (rangeToTs !== null && t > rangeToTs) return false;
        return true;
      }),
    [data, subtaskFilter, rangeFromTs, rangeToTs],
  );

  const totalMin = filteredRows.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  const effMin = filteredRows.reduce((s, r) => s + (r.effective_minutes ?? 0), 0);

  const userLabel = (uid: string) => {
    const u = users?.[uid];
    return u?.full_name ?? u?.email ?? "—";
  };
  const subtaskLabel = (sid: string | null) =>
    sid ? (subtaskTitles?.[sid] ?? "Sub-task") : "(task-level)";
  const taskColLabel = (r: TLog) =>
    r.subtask_id ? `${taskTitle} — ${subtaskTitles?.[r.subtask_id] ?? "Sub-task"}` : taskTitle;

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, { key: string; label: string; rows: TLog[] }>();
    for (const r of filteredRows) {
      const k = groupBy === "subtask" ? (r.subtask_id ?? "__task__") : r.user_id;
      const label =
        groupBy === "subtask"
          ? r.subtask_id
            ? (subtaskTitles?.[r.subtask_id] ?? "Sub-task")
            : `${taskTitle} (task-level)`
          : userLabel(r.user_id);
      const cur = map.get(k) ?? { key: k, label, rows: [] };
      cur.rows.push(r);
      map.set(k, cur);
    }
    return Array.from(map.values())
      .map((g) => {
        const tracked = g.rows.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
        const effective = g.rows.reduce((s, r) => s + (r.effective_minutes ?? 0), 0);
        return { ...g, tracked, effective, entries: g.rows.length };
      })
      .sort((a, b) => b.effective - a.effective);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, filteredRows, subtaskTitles, users, taskTitle]);

  const exportCsv = () => {
    const header = [
      "Task",
      "Sub-task",
      "User",
      "Started (IST)",
      "Started (EST)",
      "Tracked (min)",
      "Break (min)",
      "Effective (min)",
      "Note",
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const r of filteredRows) {
      const d = new Date(r.started_at);
      lines.push(
        [
          taskTitle,
          r.subtask_id ? (subtaskTitles?.[r.subtask_id] ?? "Sub-task") : "",
          userLabel(r.user_id),
          d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          d.toLocaleString("en-US", { timeZone: "America/New_York" }),
          r.duration_minutes ?? 0,
          r.break_minutes ?? 0,
          r.effective_minutes ?? 0,
          r.note ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `task-${taskId.slice(0, 8)}-timesheet-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <Skeleton className="h-24" />;
  if (!data || data.length === 0)
    return (
      <EmptyState
        icon={<Clock className="h-10 w-10" />}
        title="No time logged yet"
        description="Start the timer above to capture work on this task."
      />
    );

  const colCount = 8 + (canEdit ? 1 : 0);

  const renderRow = (r: TLog) => {
    const d = new Date(r.started_at);
    return (
      <tr key={r.id} className="border-t hover:bg-muted/20">
        <td className="px-3 py-2">
          <div className="font-medium">{taskTitle}</div>
          {r.subtask_id && (
            <div className="text-xs text-muted-foreground">
              {subtaskTitles?.[r.subtask_id] ?? "Sub-task"}
            </div>
          )}
        </td>
        <td className="px-3 py-2">{userLabel(r.user_id)}</td>
        <td className="px-3 py-2 text-xs">
          {d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        </td>
        <td className="px-3 py-2 text-xs">
          {d.toLocaleString("en-US", { timeZone: "America/New_York" })}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtDur(r.duration_minutes)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
          {r.break_minutes ? fmtDur(r.break_minutes) : "—"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
          {fmtDur(r.effective_minutes)}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-1.5">
            {r.timer_group_size > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                <Users className="h-3 w-3" /> Team · {r.timer_group_size}
              </span>
            )}
            <span>{r.note ?? "—"}</span>
          </div>
        </td>
        {canEdit && (
          <td className="px-2 py-2">
            <EffectiveEditPopover
              logId={r.id}
              durationMinutes={r.duration_minutes}
              breakMinutes={r.break_minutes ?? 0}
              effectiveOverride={r.effective_override}
              invalidateKeys={[["task-time-sheet", taskId]]}
            />
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Tracked</div>
            <div className="text-2xl font-semibold tabular-nums">{fmtDur(totalMin)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Effective</div>
            <div className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {fmtDur(effMin)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Entries</div>
            <div className="text-2xl font-semibold tabular-nums">{filteredRows.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="subtask">Sub-task</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {subtaskIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter sub-task</span>
            <Select
              value={subtaskFilter ?? "__all__"}
              onValueChange={(v) => setSubtaskFilter(v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {subtaskIds.map((sid) => (
                  <SelectItem key={sid} value={sid}>
                    {subtaskLabel(sid)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {subtaskFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setSubtaskFilter(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Range</span>
          <DateRangePicker value={dateRange} onChange={setDateRange} className="w-[260px]" />
        </div>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={exportCsv}
            title="Export CSV"
            aria-label="Export CSV"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Task / Sub-task</th>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Started (IST)</th>
              <th className="text-left px-3 py-2">Started (EST)</th>
              <th className="text-right px-3 py-2">Tracked</th>
              <th className="text-right px-3 py-2">Break</th>
              <th className="text-right px-3 py-2">Effective</th>
              <th className="text-left px-3 py-2">Note</th>
              {canEdit && <th className="w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {groups
              ? groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="bg-muted/30 border-t">
                      <td colSpan={colCount} className="px-3 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold">{g.label}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {g.entries} {g.entries === 1 ? "entry" : "entries"} · Tracked{" "}
                            {fmtDur(g.tracked)} ·{" "}
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              Effective {fmtDur(g.effective)}
                            </span>
                          </span>
                        </div>
                      </td>
                    </tr>
                    {g.rows.map(renderRow)}
                  </Fragment>
                ))
              : filteredRows.map(renderRow)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
