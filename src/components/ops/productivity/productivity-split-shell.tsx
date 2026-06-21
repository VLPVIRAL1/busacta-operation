import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { usePersistentSelection } from "@/lib/ops/use-persistent-selection";
import { activityLogsQuery } from "@/lib/queries/productivity.queries";
import { ProductivityListPane } from "@/components/ops/productivity/productivity-list-pane";
import { ProductivityDetailPane } from "@/components/ops/productivity/productivity-detail-pane";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { cn } from "@/lib/shared/utils";

const SELECTED_LS_KEY = "productivity.split.selectedLogId";

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

export function ProductivitySplitShell() {
  const { user, role } = useAuth();

  const [selectedLogId, setSelectedLogId] = usePersistentSelection(SELECTED_LS_KEY);

  const [dateFrom, setDateFrom] = useState<string>(todayYMD);
  const [dateTo, setDateTo] = useState<string>(todayYMD);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isEmployee = role === "employee";
  const effectiveUserId = isEmployee ? (user?.id ?? null) : selectedUserId;

  const { data: logs = [], isLoading } = useQuery(
    activityLogsQuery({
      userId: effectiveUserId,
      dateFrom,
      dateTo,
      sessionId: null,
    }),
  );

  const handleSelectLog = (id: string) => {
    setSelectedLogId(id);
  };

  return (
    <div className={cn("flex flex-col h-full gap-2 p-4 overflow-hidden")}>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 pb-2">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">From</span>
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm bg-background"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">To</span>
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm bg-background"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        {!isEmployee && (
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Filter by user ID</span>
            <input
              type="text"
              className="border rounded px-2 py-1 text-sm bg-background w-72"
              placeholder="Paste user UUID"
              value={selectedUserId ?? ""}
              onChange={(e) => setSelectedUserId(e.target.value.trim() || null)}
            />
          </label>
        )}
      </div>

      {/* Split pane */}
      <div className="h-[calc(100svh-240px)] min-h-[480px]">
        <ResizableTwoPane
          storageKey="productivity.split.paneWidth"
          defaultLeft={35}
          hideToolbar
          left={
            <ProductivityListPane
              logs={logs}
              selectedLogId={selectedLogId}
              onSelectLog={handleSelectLog}
              isLoading={isLoading}
            />
          }
          right={<ProductivityDetailPane logId={selectedLogId} logs={logs} />}
        />
      </div>
    </div>
  );
}
