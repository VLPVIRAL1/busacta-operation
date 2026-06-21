import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";
import type { InboxRow } from "@/lib/ops/communication.queries";

/**
 * Tiny "Inbox-zero" progress widget.
 * Shows: opened today vs total active today (read / read+unread).
 * Resets visually each local-midnight by deriving from today's last_message_at.
 */
export function InboxZeroWidget({ rows }: { rows: InboxRow[] }) {
  const { processed, total, pct } = useMemo(() => {
    const today = startOfLocalDay();
    let processed = 0;
    let total = 0;
    for (const r of rows) {
      if (r.archived) continue;
      if (!r.lastMessageAt) continue;
      if (new Date(r.lastMessageAt).getTime() < today) continue;
      total += 1;
      if (r.unread === 0) processed += 1;
    }
    const pct = total === 0 ? 100 : Math.round((processed / total) * 100);
    return { processed, total, pct };
  }, [rows]);

  if (total === 0) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="hidden lg:flex items-center gap-1.5 rounded-md border bg-card/70 px-2 py-0.5 text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-amber-500" /> Inbox zero
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Nothing landed today — you're at inbox zero.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const isZero = processed === total;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "hidden lg:flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] tabular-nums",
              isZero
                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-900/60"
                : "bg-card/70",
            )}
          >
            <Sparkles className={cn("h-3 w-3", isZero ? "text-emerald-500" : "text-amber-500")} />
            <span className="font-medium">
              {processed}/{total}
            </span>
            <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full transition-all", isZero ? "bg-emerald-500" : "bg-primary")}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Inbox-zero today: {processed} cleared of {total} threads ({pct}%).
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function startOfLocalDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
