import { Badge } from "@/components/ui/badge";
import { Building2, User } from "lucide-react";
import { cn } from "@/lib/shared/utils";

/**
 * Visual badge that distinguishes a task's business stream — B2B Firm work
 * vs B2C Client work. Used on the unified To-Do, Open-Points, and
 * cross-stream task lists.
 */
export function StreamBadge({
  stream,
  className,
}: {
  stream: "cpa" | "direct" | string | null | undefined;
  className?: string;
}) {
  const isDirect = stream === "direct";
  const Icon = isDirect ? User : Building2;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide",
        isDirect
          ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
          : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
        className,
      )}
      title={isDirect ? "B2C Client engagement" : "B2B Firm engagement"}
    >
      <Icon className="h-3 w-3" />
      {isDirect ? "Direct" : "CPA"}
    </Badge>
  );
}
