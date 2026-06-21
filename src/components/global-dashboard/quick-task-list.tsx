import { Link, useNavigate } from "@tanstack/react-router";
import { format, isPast, isToday } from "date-fns";
import { CalendarDays, CircleDot, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardTaskRow } from "@/lib/queries/global-dashboard.queries";
import { cn } from "@/lib/shared/utils";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  in_progress: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  review: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  waiting_client: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "On Hold",
  in_progress: "In Progress",
  review: "BAT",
  waiting_client: "With Client",
  complete: "Completed",
};

const ROLE_TONE: Record<string, string> = {
  A: "bg-primary/15 text-primary",
  R: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  W: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};
const ROLE_TITLE: Record<string, string> = {
  A: "Assignee",
  R: "Reviewer",
  W: "Watcher",
};

export function QuickTaskList({
  tasks,
  loading,
}: {
  tasks: DashboardTaskRow[];
  loading?: boolean;
}) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <Inbox className="h-8 w-8 opacity-50" />
        <p>No tasks match the current filters.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <ul className="divide-y">
        {tasks.map((t) => {
          const due = t.due_date ? new Date(t.due_date) : null;
          const overdue = due ? isPast(due) && !isToday(due) : false;
          return (
            <li key={t.id}>
              <Link
                to="/ops/tasks/$taskId"
                params={{ taskId: t.id }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  navigate({ to: "/ops/tasks/$taskId", params: { taskId: t.id } });
                }}
                className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50"
              >
                <CircleDot className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {t.display_id && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {t.display_id}
                      </span>
                    )}
                    <p className="truncate text-sm font-medium">{t.title}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="secondary" className={cn("px-1.5 py-0", STATUS_TONE[t.status])}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                    {t.roles?.map((r) => (
                      <span
                        key={r}
                        title={ROLE_TITLE[r]}
                        className={cn(
                          "inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-semibold",
                          ROLE_TONE[r],
                        )}
                      >
                        {r}
                      </span>
                    ))}
                    {due && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          overdue ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                        )}
                      >
                        <CalendarDays className="h-3 w-3" />
                        {format(due, "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
