import {
  AlertCircle,
  CheckCircle2,
  ListChecks,
  PauseCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/shared/utils";
import type { DashboardMetric } from "@/lib/queries/global-dashboard.queries";

type Tone = "default" | "warning" | "info" | "danger" | "success";

const TONE: Record<Tone, { text: string; chip: string; bar: string; ring: string }> = {
  default: {
    text: "text-foreground",
    chip: "bg-muted text-muted-foreground",
    bar: "bg-slate-300 dark:bg-slate-600",
    ring: "ring-primary/40",
  },
  warning: {
    text: "text-amber-600",
    chip: "bg-amber-100 text-amber-600 dark:bg-amber-950/40",
    bar: "bg-amber-400",
    ring: "ring-amber-300",
  },
  info: {
    text: "text-sky-600",
    chip: "bg-sky-100 text-sky-600 dark:bg-sky-950/40",
    bar: "bg-sky-400",
    ring: "ring-sky-300",
  },
  danger: {
    text: "text-rose-600",
    chip: "bg-rose-100 text-rose-600 dark:bg-rose-950/40",
    bar: "bg-rose-400",
    ring: "ring-rose-300",
  },
  success: {
    text: "text-emerald-600",
    chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40",
    bar: "bg-emerald-400",
    ring: "ring-emerald-300",
  },
};

type Item = { metric: DashboardMetric; label: string; icon: LucideIcon; tone: Tone };

const ITEMS: Item[] = [
  { metric: "total", label: "Total Tasks", icon: ListChecks, tone: "default" },
  { metric: "bat", label: "BAT", icon: AlertCircle, tone: "warning" },
  { metric: "with_client", label: "With Client", icon: Users, tone: "info" },
  { metric: "on_hold", label: "On Hold", icon: PauseCircle, tone: "danger" },
  { metric: "completed", label: "Completed", icon: CheckCircle2, tone: "success" },
];

export function WorkspaceKpiStrip({
  counts,
  selected,
  onSelect,
  loading,
  compact,
}: {
  counts: Record<DashboardMetric, number>;
  selected: DashboardMetric | null;
  onSelect: (m: DashboardMetric) => void;
  loading?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {ITEMS.map((it) => {
          const t = TONE[it.tone];
          const isSel = selected === it.metric;
          const Icon = it.icon;
          return (
            <button
              key={it.metric}
              type="button"
              onClick={() => onSelect(it.metric)}
              className={cn(
                "flex h-7 w-[120px] items-center justify-between gap-1.5 rounded-md border bg-card px-2 text-[11px] shadow-sm transition-colors hover:bg-accent",
                isSel && cn("ring-2 ring-offset-1", t.ring),
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon className={cn("h-3 w-3 shrink-0", t.text)} />
                <span className="truncate font-medium text-muted-foreground">{it.label}</span>
              </span>
              <span className={cn("font-bold tabular-nums", t.text)}>
                {loading ? "—" : counts[it.metric]}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 p-1">
      {ITEMS.map((it) => {
        const t = TONE[it.tone];
        const isSel = selected === it.metric;
        const Icon = it.icon;
        return (
          <button
            key={it.metric}
            type="button"
            onClick={() => onSelect(it.metric)}
            className={cn(
              "group relative flex items-center gap-2 overflow-hidden rounded-lg border bg-card px-3 py-2 shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
              isSel && cn("ring-2 ring-offset-1", t.ring),
            )}
          >
            <span className={cn("absolute inset-y-0 left-0 w-0.5", t.bar)} aria-hidden />
            <div className={cn("rounded-md p-1.5", t.chip)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="text-left">
              <p className="text-[11px] font-medium leading-none text-muted-foreground">
                {it.label}
              </p>
              <p className={cn("text-xl font-bold tabular-nums leading-tight", t.text)}>
                {loading ? "—" : counts[it.metric]}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
