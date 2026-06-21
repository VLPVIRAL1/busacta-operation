import { useState, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/shared/utils";
import type { WorkloadProfile, WorkloadTask } from "@/lib/queries/ops.queries";

export type MemberStats = {
  profile: WorkloadProfile;
  openCount: number;
  inReviewCount: number;
  dueSoonCount: number;
  weekHours: number;
  capacityHours: number;
  utilizationPct: number;
  tasks: WorkloadTask[];
};

interface WorkloadMemberCardProps {
  stats: MemberStats;
  onCapacityChange: (userId: string, hours: number) => void;
  isPending: boolean;
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "urgent",
  high: "high",
  medium: "med",
  low: "low",
};

const STATUS_LABEL: Record<string, string> = {
  ready_for_review: "Review",
  in_progress: "Active",
  draft: "Draft",
  waiting_client: "Waiting",
  on_hold: "Hold",
};

export function WorkloadMemberCard({
  stats,
  onCapacityChange,
  isPending,
}: WorkloadMemberCardProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    profile,
    openCount,
    inReviewCount,
    dueSoonCount,
    weekHours,
    capacityHours,
    utilizationPct,
    tasks,
  } = stats;

  const clampedPct = Math.min(utilizationPct, 100);
  const progressColor =
    utilizationPct > 100 ? "bg-red-500" : utilizationPct > 80 ? "bg-amber-500" : "bg-emerald-500";

  function commitCapacity() {
    const v = parseInt(inputRef.current?.value ?? "", 10);
    if (!isNaN(v) && v >= 1 && v <= 168 && v !== capacityHours) {
      onCapacityChange(profile.id, v);
    }
  }

  return (
    <Card className="flex flex-col gap-0 overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <UserAvatar
          profile={profile}
          size="sm"
          showName
          showPresence={false}
          className="font-medium"
        />
      </CardHeader>

      <CardContent className="px-4 pb-4 flex flex-col gap-3">
        {/* Task count chips */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-xs">
            {openCount} open
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {inReviewCount} review
          </Badge>
          {dueSoonCount > 0 ? (
            <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
              {dueSoonCount} due soon
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              0 due soon
            </Badge>
          )}
        </div>

        {/* Utilization bar */}
        <div className="flex flex-col gap-1">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full transition-all", progressColor)}
              style={{ width: `${clampedPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {weekHours.toFixed(1)}h / {capacityHours}h
            </span>
            <span className={cn(utilizationPct > 100 && "text-red-600 font-medium")}>
              {utilizationPct.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Capacity editor */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">Capacity (h/wk):</span>
          <Input
            ref={inputRef}
            type="number"
            min={1}
            max={168}
            defaultValue={capacityHours}
            disabled={isPending}
            className="h-6 w-16 text-xs px-1.5 py-0"
            onBlur={commitCapacity}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
        </div>

        {/* Task drill-down */}
        {tasks.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5 flex flex-col gap-1">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-2 rounded-sm px-1.5 py-1 text-xs hover:bg-muted/50 transition-colors"
                >
                  <span className="truncate text-foreground/80 leading-tight">{t.title}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {t.due_date && (
                      <span className="text-muted-foreground">
                        {new Date(t.due_date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 leading-none">
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                    {t.priority && t.priority !== "medium" && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1 py-0 h-4 leading-none",
                          t.priority === "urgent" && "border-red-400 text-red-600",
                          t.priority === "high" && "border-amber-400 text-amber-700",
                        )}
                      >
                        {PRIORITY_LABEL[t.priority] ?? t.priority}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
