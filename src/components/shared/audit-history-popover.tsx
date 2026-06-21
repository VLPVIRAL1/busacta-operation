import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { DateTime } from "@/components/shared/date-time";
import { supabase } from "@/integrations/supabase/client";

export interface AuditEventRow {
  id: string;
  actor_id: string | null;
  event: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Generic audit-history list used by Open Points and Sub-tasks.
 * Resolves actor + user-id values in `before`/`after` payloads against profiles.
 */
export function AuditHistoryList({
  events,
  isLoading,
  createdAt,
}: {
  events: AuditEventRow[] | undefined;
  isLoading: boolean;
  createdAt?: string;
}) {
  const data = events ?? [];

  const actorIds = useMemo(
    () => Array.from(new Set(data.map((e) => e.actor_id).filter(Boolean) as string[])),
    [data],
  );
  const userIds = useMemo(() => {
    const ids = new Set<string>();
    data.forEach((ev) => {
      const b = (ev.before ?? {}) as Record<string, unknown>;
      const a = (ev.after ?? {}) as Record<string, unknown>;
      [b.assignee_id, a.assignee_id].forEach((v) => {
        if (typeof v === "string") ids.add(v);
      });
    });
    return Array.from(ids);
  }, [data]);

  const allIds = useMemo(() => Array.from(new Set([...actorIds, ...userIds])), [actorIds, userIds]);

  const { data: people } = useQuery({
    queryKey: ["audit-people", allIds.join(",")],
    enabled: allIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", allIds);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
    },
  });

  const nameOf = (id: unknown): string => {
    if (typeof id !== "string" || !id) return "—";
    const p = people?.[id];
    return p?.full_name ?? p?.email ?? "Someone";
  };

  const formatEvent = (ev: AuditEventRow): string => {
    const b = (ev.before ?? {}) as Record<string, unknown>;
    const a = (ev.after ?? {}) as Record<string, unknown>;
    const pretty = (s: unknown) => (s == null ? "—" : String(s).replace(/_/g, " "));
    switch (ev.event) {
      case "created":
        return `created this${a.title ? ` "${a.title}"` : ""}`;
      case "title_changed":
        return `renamed from "${b.title ?? ""}" to "${a.title ?? ""}"`;
      case "kind_changed":
        return `changed type from ${pretty(b.kind)} to ${pretty(a.kind)}`;
      case "status_changed":
        return `changed status from ${pretty(b.status)} to ${pretty(a.status)}`;
      case "completed":
        return `marked as Done`;
      case "reopened":
        return `reopened (was Done)`;
      case "assigned":
        if (!b.assignee_id && a.assignee_id) return `assigned to ${nameOf(a.assignee_id)}`;
        if (b.assignee_id && !a.assignee_id) return `unassigned ${nameOf(b.assignee_id)}`;
        return `reassigned from ${nameOf(b.assignee_id)} to ${nameOf(a.assignee_id)}`;
      case "assignees_changed":
        return `updated assignees`;
      case "start_changed":
        return `changed start date`;
      case "end_changed":
        return `changed end date`;
      case "due_changed":
        return `changed due date`;
      case "deleted":
        return `deleted this`;
      case "restored":
        return `restored this`;
      default:
        return ev.event.replace(/_/g, " ");
    }
  };

  return (
    <div className="max-h-80 overflow-auto p-3 text-xs space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        History
      </div>
      {createdAt && (
        <div className="text-[11px] text-muted-foreground">
          Created <DateTime value={createdAt} mode="datetime" className="text-[11px]" />
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : data.length === 0 ? (
        <p className="italic text-muted-foreground">No history.</p>
      ) : (
        <ol className="relative space-y-2.5 border-l border-border/60 pl-4">
          {data.map((ev) => {
            const actorName = nameOf(ev.actor_id);
            return (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[19px] top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                <div className="text-[12px] leading-snug">
                  <span className="font-semibold">{actorName}</span>{" "}
                  <span className="text-muted-foreground">{formatEvent(ev)}</span>
                </div>
                <DateTime
                  value={ev.created_at}
                  mode="datetime"
                  className="text-[10px] text-muted-foreground"
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
