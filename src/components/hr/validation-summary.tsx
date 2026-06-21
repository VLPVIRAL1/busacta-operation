import {
  AlertTriangle,
  Clock,
  CalendarX,
  UserX,
  Hourglass,
  TimerOff,
  FileX,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type ValidationBucketId =
  | "missing_name"
  | "unmatched_employee"
  | "invalid_date"
  | "invalid_time"
  | "late_arrival"
  | "early_checkout"
  | "below_half_day"
  | "below_full_day"
  | "db_insert_error";

export type ValidationBucket = {
  id: ValidationBucketId;
  label: string;
  count: number;
  /** Plain-English policy threshold, e.g. "Late = punch in after 09:15". */
  threshold?: string;
  tone: "destructive" | "warning" | "info";
};

const ICONS: Record<ValidationBucketId, React.ComponentType<{ className?: string }>> = {
  missing_name: UserX,
  unmatched_employee: UserX,
  invalid_date: CalendarX,
  invalid_time: TimerOff,
  late_arrival: Clock,
  early_checkout: Clock,
  below_half_day: Hourglass,
  below_full_day: Hourglass,
  db_insert_error: FileX,
};

export function ValidationSummary({
  buckets,
  activeBucket,
  onSelectBucket,
  title = "Why rows failed or were flagged",
}: {
  buckets: ValidationBucket[];
  activeBucket?: ValidationBucketId | null;
  onSelectBucket?: (id: ValidationBucketId | null) => void;
  title?: string;
}) {
  const visible = buckets.filter((b) => b.count > 0);
  if (visible.length === 0) {
    return (
      <Card className="border-border-subtle">
        <CardContent className="p-4 text-xs text-muted-foreground flex items-center gap-2">
          <Filter className="h-3.5 w-3.5" /> No validation issues across {buckets.length} rules.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border-subtle">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          {title}
          {activeBucket && onSelectBucket && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 px-2 text-[11px]"
              onClick={() => onSelectBucket(null)}
            >
              Clear filter
            </Button>
          )}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((b) => {
            const Icon = ICONS[b.id];
            const active = activeBucket === b.id;
            const tone =
              b.tone === "destructive"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : b.tone === "warning"
                  ? "border-amber-500/40 bg-amber-50/60 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"
                  : "border-blue-500/40 bg-blue-50/60 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100";
            return (
              <button
                key={b.id}
                type="button"
                disabled={!onSelectBucket}
                onClick={() => onSelectBucket?.(active ? null : b.id)}
                className={`flex items-start gap-2 rounded-md border p-2 text-left text-xs transition ${tone} ${active ? "ring-2 ring-primary/60" : ""} ${onSelectBucket ? "hover:brightness-105 cursor-pointer" : "cursor-default"}`}
              >
                <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{b.label}</span>
                    <span className="tabular-nums font-semibold">{b.count.toLocaleString()}</span>
                  </div>
                  {b.threshold && (
                    <div className="text-[11px] opacity-80 truncate">{b.threshold}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
