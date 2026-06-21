import { cn } from "@/lib/shared/utils";

interface ActivityBarChipProps {
  percentage: number;
}

export function ActivityBarChip({ percentage }: ActivityBarChipProps) {
  const isGreen = percentage >= 70;
  const isAmber = percentage >= 40 && percentage < 70;

  const fillClass = isGreen ? "bg-green-500" : isAmber ? "bg-amber-500" : "bg-red-500";

  const textClass = isGreen
    ? "text-green-700 dark:text-green-400"
    : isAmber
      ? "text-amber-700 dark:text-amber-400"
      : "text-red-700 dark:text-red-400";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", fillClass)}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
      <span className={cn("text-xs font-medium tabular-nums", textClass)}>
        {Math.round(percentage)}%
      </span>
    </div>
  );
}
