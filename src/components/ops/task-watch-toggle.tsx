import { Eye, EyeOff } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { toast } from "sonner";

/**
 * Watch / Unwatch toggle for a task. Wires the `task_watchers` table so the
 * user appears in `inbox_summary` for this task even when they are not an
 * assignee, reviewer, or creator. RLS scopes inserts/deletes to the caller.
 */
export function TaskWatchToggle({
  taskId,
  compact = false,
}: {
  taskId: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id ?? null;

  const { data: watching = false } = useQuery({
    queryKey: ["task-watch", taskId, uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_watchers")
        .select("user_id")
        .eq("task_id", taskId)
        .eq("user_id", uid!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const toggle = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("not_authenticated");
      if (watching) {
        const { error } = await supabase
          .from("task_watchers")
          .delete()
          .eq("task_id", taskId)
          .eq("user_id", uid);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase
        .from("task_watchers")
        .insert({ task_id: taskId, user_id: uid });
      if (error) throw error;
      return true;
    },
    onSuccess: (now) => {
      qc.setQueryData(["task-watch", taskId, uid], now);
      qc.invalidateQueries({ queryKey: ["inbox-summary"] });
      toast.success(now ? "Watching this task" : "Stopped watching");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!uid) return null;

  const Icon = watching ? Eye : EyeOff;
  const label = watching ? "Unwatch" : "Watch";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size={compact ? "icon" : "sm"}
            variant={watching ? "default" : "outline"}
            aria-pressed={watching}
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
            className={compact ? "h-8 w-8" : "h-8 gap-1.5"}
          >
            <Icon className="h-4 w-4" />
            {!compact && <span className="text-xs">{label}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {watching ? "Stop watching this task" : "Watch this task for inbox updates"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
