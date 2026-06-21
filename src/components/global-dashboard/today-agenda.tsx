import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isPast, parseISO } from "date-fns";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Sun,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { todayAgendaQuery, type TodayAgendaItem } from "@/lib/queries/global-dashboard.queries";
import { noteColor } from "./note-colors";
import { cn } from "@/lib/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABEL: Record<string, string> = {
  draft: "On Hold",
  in_progress: "In Progress",
  review: "BAT",
  waiting_client: "With Client",
  complete: "Done",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  review: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  waiting_client: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function timeLabel(item: TodayAgendaItem): { text: string; overdue: boolean } {
  if (item.kind === "reminder") {
    if (!item.remind_at) return { text: "Today", overdue: false };
    const d = new Date(item.remind_at);
    const overdue = isPast(d) && !isToday(d);
    return {
      text: overdue ? `Overdue · ${format(d, "MMM d")}` : format(d, "h:mm a"),
      overdue,
    };
  }
  return { text: "Due today", overdue: false };
}

export function TodayAgendaPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery(todayAgendaQuery(userId));
  const [collapsed, setCollapsed] = useState(false);

  const incompleteCount = data.length;

  const completeReminder = async (id: string) => {
    await supabase
      .from("personal_reminders")
      .update({ completed_at: new Date().toISOString() } as never)
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["global-dashboard", "today-agenda", userId] });
    qc.invalidateQueries({ queryKey: ["global-dashboard", "reminders", userId] });
  };

  if (!isLoading && incompleteCount === 0) return null;

  return (
    <div className="border-b bg-gradient-to-r from-amber-50/60 via-background to-sky-50/60 dark:from-amber-950/20 dark:via-background dark:to-sky-950/20">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Sun className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold">Today</span>
        {isLoading ? (
          <Skeleton className="h-4 w-12 rounded-full" />
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {incompleteCount} item{incompleteCount !== 1 ? "s" : ""}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </span>
      </button>

      {/* Items */}
      {!collapsed && (
        <ul className="flex flex-wrap gap-2 px-3 pb-2.5 pt-0">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-8 w-44 rounded-lg" />
                </li>
              ))
            : data.map((item) => (
                <AgendaChip
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  onComplete={
                    item.kind === "reminder" ? () => completeReminder(item.id) : undefined
                  }
                />
              ))}
        </ul>
      )}
    </div>
  );
}

function AgendaChip({ item, onComplete }: { item: TodayAgendaItem; onComplete?: () => void }) {
  const { text: timeText, overdue } = timeLabel(item);

  if (item.kind === "reminder") {
    const c = noteColor(item.color);
    const tinted = item.color && item.color !== "default";
    return (
      <li
        className={cn(
          "group relative flex items-center gap-1.5 overflow-hidden rounded-lg border pl-2 pr-2.5 py-1.5 text-sm shadow-sm transition-shadow hover:shadow-md",
          tinted ? c.tile : "bg-card border-border",
        )}
      >
        <span className={cn("absolute inset-y-0 left-0 w-1", c.bar)} aria-hidden />
        <Bell
          className={cn(
            "ml-0.5 h-3.5 w-3.5 shrink-0",
            overdue ? "text-rose-500" : "text-amber-500",
          )}
        />
        <span className="max-w-[180px] truncate font-medium">{item.body}</span>
        <span
          className={cn(
            "shrink-0 text-[11px]",
            overdue ? "text-rose-600 font-medium" : "text-muted-foreground",
          )}
        >
          {timeText}
        </span>
        {onComplete && (
          <button
            type="button"
            onClick={onComplete}
            title="Mark complete"
            className="ml-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-emerald-600"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )}
      </li>
    );
  }

  // Task chip
  return (
    <li>
      <Link
        to="/ops/tasks/$taskId"
        params={{ taskId: item.id }}
        className="group flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm shadow-sm transition-shadow hover:shadow-md"
      >
        <CircleDot className="h-3.5 w-3.5 shrink-0 text-sky-500" />
        {item.display_id && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {item.display_id}
          </span>
        )}
        <span className="max-w-[180px] truncate font-medium">{item.title}</span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
            STATUS_TONE[item.status] ?? "bg-muted text-muted-foreground",
          )}
        >
          {STATUS_LABEL[item.status] ?? item.status}
        </span>
      </Link>
    </li>
  );
}
