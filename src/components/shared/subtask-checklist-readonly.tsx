import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/shared/utils";

/**
 * Read-only subtask checklist. Used by surfaces that should drill into a
 * task's progress without exposing the editor (client portal, B2C Client
 * detail tab). Mirrors SubtaskList visuals but never mutates.
 */
export function SubtaskChecklistReadonly({ taskId }: { taskId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["subtasks-readonly", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_subtasks")
        .select("id, title, status, is_done, sort_order")
        .eq("task_id", taskId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return <div className="text-xs italic text-muted-foreground px-2 py-1">No sub-tasks yet.</div>;
  }

  return (
    <ul className="space-y-1">
      {data.map((s) => {
        const Icon =
          s.is_done || s.status === "done"
            ? CheckCircle2
            : s.status === "in_progress"
              ? CircleDashed
              : Circle;
        const tone =
          s.is_done || s.status === "done"
            ? "text-emerald-600 dark:text-emerald-400"
            : s.status === "in_progress"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground";
        return (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-2 text-xs px-2 py-1 rounded-sm",
              (s.is_done || s.status === "done") && "opacity-70",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5 shrink-0", tone)} />
            <span className={cn("truncate", (s.is_done || s.status === "done") && "line-through")}>
              {s.title}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Returns done / total counts for a task's subtasks. */
export function useSubtaskProgress(taskId: string) {
  return useQuery({
    queryKey: ["subtask-progress", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_subtasks")
        .select("is_done, status")
        .eq("task_id", taskId);
      const rows = data ?? [];
      const done = rows.filter((r) => r.is_done || r.status === "done").length;
      return { done, total: rows.length };
    },
    staleTime: 30_000,
  });
}
