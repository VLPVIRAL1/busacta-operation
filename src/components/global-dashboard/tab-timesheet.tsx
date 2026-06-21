import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { Clock, Activity, CalendarDays, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { timesheetQuery, type TimesheetEntry } from "@/lib/queries/global-dashboard.queries";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { cn } from "@/lib/shared/utils";

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

function fmtMinutes(m: number | null): string {
  if (!m) return "—";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

export function TabTimesheet() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [day, setDay] = useState<string>(todayISO());

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 30; i++) out.push(format(subDays(new Date(), i), "yyyy-MM-dd"));
    return out;
  }, []);

  const { data: entries = [], isLoading } = useQuery(timesheetQuery(userId, day));

  const totalMinutes = entries
    .filter((e) => e.kind === "time_log")
    .reduce((acc, e) => acc + (e.duration_minutes ?? 0), 0);

  const left = (
    <div className="h-full min-h-0 flex flex-col border rounded-lg overflow-hidden bg-background">
      <aside className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Last 30 Days</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-0.5">
          {days.map((d) => {
            const active = d === day;
            const isToday = d === todayISO();
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                )}
              >
                <span>{format(parseISO(d), "EEE, MMM d")}</span>
                {isToday && (
                  <span className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
                    Today
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );

  const right = (
    <div className="h-full min-h-0 flex flex-col border rounded-lg overflow-hidden bg-background">
      <main className="flex h-full min-h-0 flex-col">
        <header className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
          <div>
            <h2 className="text-sm font-semibold">{format(parseISO(day), "EEEE, MMMM d, yyyy")}</h2>
            <p className="text-[11px] text-muted-foreground">{entries.length} events recorded</p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-600"
            title="Total time tracked"
          >
            <Clock className="h-3.5 w-3.5" />
            {fmtMinutes(totalMinutes)}
          </span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded for this day.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-border pl-5">
              {entries.map((e) => (
                <TimelineRow key={`${e.kind}-${e.id}`} entry={e} />
              ))}
            </ol>
          )}
        </div>
      </main>
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <ResizableTwoPane
        storageKey="global-timesheet-split"
        defaultLeft={20}
        minLeft={14}
        maxLeft={45}
        hideToolbar
        left={left}
        right={right}
      />
    </div>
  );
}

function TimelineRow({ entry }: { entry: TimesheetEntry }) {
  const isLog = entry.kind === "time_log";
  const Icon = isLog ? Clock : Activity;
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[26px] top-1.5 grid h-5 w-5 place-items-center rounded-full border",
          isLog
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
            : "border-blue-500/40 bg-blue-500/10 text-blue-600",
        )}
      >
        <Icon className="h-3 w-3" />
      </span>
      <div className="rounded-lg border bg-card px-3 py-2 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {format(parseISO(entry.at), "h:mm a")}
          </span>
          {isLog && (
            <span className="text-xs font-semibold">{fmtMinutes(entry.duration_minutes)}</span>
          )}
        </div>
        <div className="mt-1 text-sm">
          {entry.task_id ? (
            <Link
              to="/ops/tasks/$taskId"
              params={{ taskId: entry.task_id }}
              className="font-medium hover:underline inline-flex items-center gap-1"
            >
              {entry.task_display_id && (
                <span className="text-[11px] text-muted-foreground">{entry.task_display_id}</span>
              )}
              {entry.task_title ?? "Untitled task"}
              <ExternalLink className="h-3 w-3 opacity-50" />
            </Link>
          ) : (
            <span className="text-muted-foreground italic">No task</span>
          )}
          {!isLog && entry.event_type && (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize">
              {entry.event_type.replace(/_/g, " ")}
            </span>
          )}
        </div>
        {entry.note && <p className="mt-1 text-xs text-muted-foreground">{entry.note}</p>}
      </div>
    </li>
  );
}
