import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  MessageSquare,
  GitBranch,
  UserCheck,
  ClipboardList,
  Eye,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { fmtIST } from "@/lib/format/time";
import { toneChip } from "@/lib/ui/tone";

const EVENT_META: Record<string, { icon: typeof ActivityIcon; tone: string; label: string }> = {
  task_created: { icon: ClipboardList, tone: toneChip("blue"), label: "Task created" },
  status_changed: { icon: GitBranch, tone: toneChip("amber"), label: "Status changed" },
  assignee_changed: { icon: UserCheck, tone: toneChip("sky"), label: "Assignee changed" },
  reviewer_changed: { icon: UserCheck, tone: toneChip("sky"), label: "Reviewer changed" },
  message_visibility_changed: { icon: Eye, tone: toneChip("rose"), label: "Visibility changed" },
  message_created: { icon: MessageSquare, tone: toneChip("emerald"), label: "New message" },
};

export interface FirmActivityPanelProps {
  firmId: string;
  /** Optional filter: only show events for these task IDs. */
  taskIds?: string[] | null;
  /** Optional filter: only show events with these actor IDs. */
  actorIds?: string[] | null;
  /** Compact density (smaller text, tighter spacing). */
  compact?: boolean;
  /** Optional explicit title; pass null/false to hide. */
  title?: string | null;
}

export function FirmActivityPanel({
  firmId,
  taskIds,
  actorIds,
  compact = false,
  title = "Activity",
}: FirmActivityPanelProps) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["firm-activity", firmId],
    queryFn: async () => {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, client_entities!inner(project_id, projects!inner(firm_id))")
        .eq("client_entities.projects.firm_id", firmId);
      const ids = (tasks ?? []).map((t) => t.id);
      const titleMap = new Map((tasks ?? []).map((t) => [t.id, t.title]));
      if (ids.length === 0) return [];
      const { data: audit, error } = await supabase
        .from("task_audit")
        .select("id, task_id, actor_id, event_type, payload, created_at")
        .in("task_id", ids)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (audit ?? []).map((a) => ({ ...a, _title: titleMap.get(a.task_id) ?? "Task" }));
    },
  });

  useRealtimeChannel(`firm-activity-${firmId}`, (channel) =>
    channel.on("postgres_changes", { event: "*", schema: "public", table: "task_audit" }, () =>
      qc.invalidateQueries({ queryKey: ["firm-activity", firmId] }),
    ),
  );

  const filtered = useMemo(() => {
    const all = data ?? [];
    return all.filter((row) => {
      if (taskIds && taskIds.length && !taskIds.includes(row.task_id)) return false;
      if (actorIds && actorIds.length && (!row.actor_id || !actorIds.includes(row.actor_id)))
        return false;
      return true;
    });
  }, [data, taskIds, actorIds]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {title !== null && (
        <h2
          className={`flex items-center gap-2 font-semibold ${compact ? "text-xs mb-2" : "text-sm mb-4"}`}
        >
          <ActivityIcon className={compact ? "h-3.5 w-3.5 text-primary" : "h-4 w-4 text-primary"} />
          {title}
          {filtered.length > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
              ({filtered.length})
            </span>
          )}
        </h2>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ActivityIcon className="h-8 w-8" />}
            title="No activity"
            description="Status changes and message events will appear here."
          />
        ) : (
          <ol className={compact ? "space-y-2" : "space-y-3"}>
            {filtered.map((row) => {
              const meta = EVENT_META[row.event_type] ?? {
                icon: ActivityIcon,
                tone: "bg-muted text-foreground",
                label: row.event_type,
              };
              const Icon = meta.icon;
              return (
                <li key={row.id} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 ${compact ? "h-5 w-5" : "h-7 w-7"} items-center justify-center rounded-full ${meta.tone}`}
                  >
                    <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={compact ? "text-[11px] leading-tight" : "text-sm"}>
                      <span className="font-medium">{meta.label}</span>
                      {" — "}
                      <Link
                        to="/ops/tasks/$taskId"
                        params={{ taskId: row.task_id }}
                        className="hover:underline"
                      >
                        {(row as { _title: string })._title}
                      </Link>
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {fmtIST(row.created_at)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
