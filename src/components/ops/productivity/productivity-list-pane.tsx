import { cn } from "@/lib/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { type ActivityLog } from "@/lib/queries/productivity.queries";
import { ActivityBarChip } from "@/components/ops/productivity/activity-bar-chip";

interface ProductivityListPaneProps {
  logs: ActivityLog[];
  selectedLogId: string | null;
  onSelectLog: (id: string) => void;
  isLoading?: boolean;
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function fmtTime(iso: string) {
  return timeFmt.format(new Date(iso));
}

function fmtDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

export function ProductivityListPane({
  logs,
  selectedLogId,
  onSelectLog,
  isLoading = false,
}: ProductivityListPaneProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Activity Timeline</h2>
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {logs.length}
          </span>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y">
        {isLoading ? (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <Skeleton className="h-14 w-full" />
              </div>
            ))}
          </>
        ) : logs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">No activity recorded for this period</p>
          </div>
        ) : (
          <>
            {logs.map((log, index) => {
              const prevLog = index > 0 ? logs[index - 1] : null;
              const isNewSession = !prevLog || prevLog.session_id !== log.session_id;
              const sessionStartDate = log.productivity_sessions?.started_at ?? log.interval_start;

              return (
                <div key={log.id}>
                  {isNewSession && (
                    <div className="px-4 py-1.5 bg-muted/40">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {fmtDate(sessionStartDate)}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    className={cn(
                      "w-full text-left px-4 py-3 flex flex-col gap-1.5 border-l-2 transition-colors",
                      log.id === selectedLogId
                        ? "bg-violet-50 dark:bg-violet-950/30 border-l-violet-500"
                        : "border-l-transparent hover:bg-muted/50",
                    )}
                    onClick={() => onSelectLog(log.id)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium tabular-nums">
                        {fmtTime(log.interval_start)} – {fmtTime(log.interval_end)}
                      </span>
                      <span className="text-xs text-muted-foreground truncate ml-2 max-w-[120px]">
                        {log.active_application_name ?? "—"}
                      </span>
                    </div>
                    <ActivityBarChip percentage={log.activity_percentage} />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
