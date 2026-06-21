import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { CHANNEL_META, STATUS_META, type Campaign } from "./marketing";

export const Route = createFileRoute("/growth/calendar")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Growth", to: "/growth" }, { label: "Marketing Calendar" }]}>
        <CalendarPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type TaskLite = {
  id: string;
  campaign_id: string;
  title: string;
  done: boolean;
  due_date: string | null;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function iso(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Weeks of date cells covering the full month grid (leading/trailing days included). */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { iso: string; day: number; inMonth: boolean }[] = [];

  const prevDays = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevDays - i;
    const date = new Date(year, month - 1, d);
    cells.push({ iso: iso(date.getFullYear(), date.getMonth(), d), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: iso(year, month, d), day: d, inMonth: true });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    const date = new Date(year, month + 1, next);
    cells.push({ iso: iso(date.getFullYear(), date.getMonth(), next), day: next, inMonth: false });
    next++;
  }
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function CalendarPage() {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());

  const campaignsQ = useQuery({
    queryKey: ["calendar", "campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_campaigns").select("*");
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });

  const tasksQ = useQuery({
    queryKey: ["calendar", "tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_tasks")
        .select("id, campaign_id, title, done, due_date")
        .not("due_date", "is", null);
      if (error) throw error;
      return (data ?? []) as TaskLite[];
    },
  });

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  const campaigns = campaignsQ.data ?? [];
  const tasks = tasksQ.data ?? [];

  // Items per day: campaigns active that day + tasks due that day.
  const itemsForDay = (dayIso: string) => {
    const activeCampaigns = campaigns.filter((c) => {
      const lo = c.start_date ?? c.end_date;
      const hi = c.end_date ?? c.start_date;
      if (!lo || !hi) return false;
      return dayIso >= lo && dayIso <= hi;
    });
    const dueTasks = tasks.filter((t) => t.due_date === dayIso);
    return { activeCampaigns, dueTasks };
  };

  const isLoading = campaignsQ.isLoading || tasksQ.isLoading;

  const move = (delta: number) => {
    setCursor((c) => {
      const m = c.month + delta;
      const year = c.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing Calendar"
        description="Campaign run-dates and task deadlines at a glance."
      />

      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">
          {MONTHS[cursor.month]} {cursor.year}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => move(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
          >
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => move(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-[32rem]" />
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-3">
            <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-medium uppercase text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weeks.flat().map((cell) => {
                const { activeCampaigns, dueTasks } = itemsForDay(cell.iso);
                const isToday = cell.iso === todayIso;
                return (
                  <div
                    key={cell.iso}
                    className={`min-h-24 rounded-md border p-1 ${
                      cell.inMonth ? "bg-background" : "bg-muted/40"
                    } ${isToday ? "ring-2 ring-primary" : ""}`}
                  >
                    <div
                      className={`mb-1 text-right text-[11px] tabular-nums ${
                        cell.inMonth ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {cell.day}
                    </div>
                    <div className="space-y-0.5">
                      {activeCampaigns.slice(0, 3).map((c) => {
                        const Icon = CHANNEL_META[c.channel].Icon;
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] ${STATUS_META[c.status].tone}`}
                            title={`${c.name} — ${STATUS_META[c.status].label}`}
                          >
                            <Icon className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{c.name}</span>
                          </div>
                        );
                      })}
                      {activeCampaigns.length > 3 && (
                        <div className="px-1 text-[10px] text-muted-foreground">
                          +{activeCampaigns.length - 3} more
                        </div>
                      )}
                      {dueTasks.slice(0, 2).map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-1 truncate px-1 text-[10px] text-muted-foreground"
                          title={t.title}
                        >
                          {t.done ? (
                            <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-green-600" />
                          ) : (
                            <Circle className="h-2.5 w-2.5 shrink-0" />
                          )}
                          <span className={`truncate ${t.done ? "line-through" : ""}`}>
                            {t.title}
                          </span>
                        </div>
                      ))}
                      {dueTasks.length > 2 && (
                        <div className="px-1 text-[10px] text-muted-foreground">
                          +{dueTasks.length - 2} tasks
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        {Object.entries(STATUS_META).map(([k, m]) => (
          <span key={k} className={`rounded px-1.5 py-0.5 ${m.tone}`}>
            {m.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <Circle className="h-3 w-3" /> task due
        </span>
      </div>
    </div>
  );
}
