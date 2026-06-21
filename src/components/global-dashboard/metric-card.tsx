import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/shared/utils";

const TONE: Record<string, { text: string; chip: string; bar: string; ring: string }> = {
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

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  loading,
  selected,
  onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "warning" | "info" | "danger" | "success";
  loading?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const t = TONE[tone];
  return (
    <Card
      onClick={onClick}
      className={cn(
        "relative cursor-pointer overflow-hidden border shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
        selected && cn("ring-2 ring-offset-1", t.ring),
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", t.bar)} aria-hidden />
      <CardContent className="flex items-center gap-3 p-3 pl-4">
        <div className={cn("rounded-lg p-2", t.chip)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-8 w-12" />
          ) : (
            <p className={cn("text-3xl font-bold leading-tight tabular-nums", t.text)}>{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
