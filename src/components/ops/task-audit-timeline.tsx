import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  formatAuditEvent,
  resolveAuditNames,
  type FormattedAuditEvent,
} from "@/lib/format/audit-format";
import { cn } from "@/lib/shared/utils";

interface Row {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
}

type CategoryFilter = "all" | FormattedAuditEvent["category"];

const FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "status", label: "Status" },
  { value: "assignment", label: "Assignees" },
  { value: "message", label: "Messages" },
  { value: "file", label: "Files" },
  { value: "link", label: "Links" },
  { value: "task", label: "Task" },
];

const PAGE = 25;
const DEDUP_WINDOW_MS = 5_000;

/** Collapse adjacent rows that share (event_type, payload, actor) within DEDUP_WINDOW_MS. */
function dedupRows(rows: Row[]): Row[] {
  const out: Row[] = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.event_type === r.event_type &&
      prev.actor_id === r.actor_id &&
      JSON.stringify(prev.payload ?? {}) === JSON.stringify(r.payload ?? {}) &&
      Math.abs(new Date(prev.created_at).getTime() - new Date(r.created_at).getTime()) <
        DEDUP_WINDOW_MS
    ) {
      // keep the newer (already-added since we sort desc) one — skip the older duplicate
      continue;
    }
    out.push(r);
  }
  return out;
}

export function TaskAuditTimeline({ taskId }: { taskId: string }) {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [limit, setLimit] = useState(PAGE);

  const { data, isLoading } = useQuery({
    queryKey: ["task-audit", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_audit")
        .select("id, event_type, payload, actor_id, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // Pre-format every row so we can collect referenced user IDs and filter by category in one pass.
  const formatted = useMemo(() => {
    const rows = dedupRows(data ?? []);
    return rows.map((row) => ({ row, fmt: formatAuditEvent(row.event_type, row.payload) }));
  }, [data]);

  // Batch profile lookup: actors + every UUID referenced inside a phrase.
  const personIds = useMemo(() => {
    const set = new Set<string>();
    for (const { row, fmt } of formatted) {
      if (row.actor_id) set.add(row.actor_id);
      for (const id of fmt.refUserIds) set.add(id);
    }
    return Array.from(set);
  }, [formatted]);

  const { data: people } = useQuery({
    queryKey: ["task-audit-people", personIds.join(",")],
    enabled: personIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", personIds);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
    },
  });

  const lookup = (id: string) => {
    const p = people?.[id];
    return p?.full_name ?? p?.email ?? "Someone";
  };

  const filtered = useMemo(
    () => (filter === "all" ? formatted : formatted.filter(({ fmt }) => fmt.category === filter)),
    [formatted, filter],
  );

  const visible = filtered.slice(0, limit);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? "default" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              setFilter(f.value);
              setLimit(PAGE);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
          <History className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-xs text-muted-foreground">
            {filter === "all" ? "No activity yet on this task." : "Nothing matches this filter."}
          </p>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l border-border/60 pl-5">
          {visible.map(({ row, fmt }) => {
            const Icon = fmt.icon;
            const actorName = row.actor_id ? lookup(row.actor_id) : "Someone";
            const phrase = resolveAuditNames(fmt.text, lookup);
            return (
              <li key={row.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[27px] top-0.5 grid h-5 w-5 place-items-center rounded-full",
                    "bg-background ring-1 ring-border/60 text-muted-foreground",
                  )}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <p className="text-xs leading-snug text-foreground">
                  <span className="font-medium">{actorName}</span>{" "}
                  <span className="text-muted-foreground">{phrase}</span>
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {filtered.length > limit && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-[11px]"
          onClick={() => setLimit((l) => l + PAGE)}
        >
          Show {Math.min(PAGE, filtered.length - limit)} more
        </Button>
      )}
    </div>
  );
}
