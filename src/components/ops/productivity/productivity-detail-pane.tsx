import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type ActivityLog } from "@/lib/queries/productivity.queries";
import { ScreenshotViewer } from "@/components/ops/productivity/screenshot-viewer";
import { getScreenshotSignedUrl } from "@/lib/ops/productivity.functions";

interface ProductivityDetailPaneProps {
  logId: string | null;
  logs: ActivityLog[];
}

export function ProductivityDetailPane({ logId, logs }: ProductivityDetailPaneProps) {
  const log = logId ? (logs.find((l) => l.id === logId) ?? null) : null;

  const { data: urlData, isFetching } = useQuery({
    queryKey: ["screenshot-url", logId],
    queryFn: () => getScreenshotSignedUrl({ data: { logId: logId! } }),
    staleTime: 50000,
    enabled: !!logId,
  });

  if (!logId) {
    return (
      <div className="flex flex-col h-full min-h-0 items-center justify-center gap-3 p-8 text-muted-foreground">
        <Clock className="h-8 w-8 opacity-40" />
        <p className="text-sm">Select an activity interval to view details</p>
      </div>
    );
  }

  const durationMin = log
    ? Math.round(
        (new Date(log.interval_end).getTime() - new Date(log.interval_start).getTime()) / 60000,
      )
    : 0;

  const project = log?.productivity_sessions?.projects;

  const stats: { label: string; value: string }[] = log
    ? [
        { label: "Keystrokes", value: String(log.keystrokes_count) },
        { label: "Mouse Clicks", value: String(log.mouse_clicks_count) },
        { label: "Activity", value: `${log.activity_percentage}%` },
        { label: "Duration", value: `${durationMin} min` },
        { label: "Application", value: log.active_application_name ?? "—" },
        { label: "Active Window", value: log.active_window_title ?? "—" },
      ]
    : [];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto p-4">
      <ScreenshotViewer signedUrl={urlData?.url ?? null} isLoading={isFetching} />

      {log && (
        <>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {stats.map(({ label, value }) => (
              <div key={label} className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  {label}
                </div>
                <div className="text-sm font-medium truncate" title={value}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {project && (
            <div className="mt-4">
              <Badge variant="secondary">{project.name}</Badge>
            </div>
          )}
        </>
      )}
    </div>
  );
}
