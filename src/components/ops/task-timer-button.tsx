import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";
import { EffectiveHoursStopDialog } from "@/components/ops/effective-hours-stop-dialog";
import { timerRunningKey } from "@/components/ops/timer-widget";

interface OpenTaskTimerRow {
  id: string;
  task_id: string;
  started_at: string;
}

export function taskOpenTimerKey(taskId: string, userId?: string | null) {
  return ["task-open-timer", taskId, userId ?? "anon"] as const;
}

/** Compact Start/Stop button for a top-level task (subtask_id IS NULL). */
export function TaskTimerButton({ taskId, className }: { taskId: string; className?: string }) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isInternal = role === "admin" || role === "super_admin" || role === "employee";
  const [effOpen, setEffOpen] = useState(false);
  const queryKey = taskOpenTimerKey(taskId, user?.id);

  const { data: open } = useQuery({
    queryKey,
    enabled: !!user && isInternal,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_logs")
        .select("id, task_id, started_at")
        .eq("user_id", user!.id)
        .eq("task_id", taskId)
        .is("subtask_id", null)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as OpenTaskTimerRow | null) ?? null;
    },
    refetchInterval: 30000,
  });

  const isRunning = !!open;
  const elapsed = useElapsed(open?.started_at);

  const start = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("time_logs").insert({
        task_id: taskId,
        user_id: user.id,
        started_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timer started");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stop = useMutation({
    mutationFn: async (effectiveMinutes: number) => {
      if (!open || !user) return;
      const ended = new Date();
      const dur = Math.max(
        1,
        Math.round((ended.getTime() - new Date(open.started_at).getTime()) / 60000),
      );
      const patch: { ended_at: string; duration_minutes: number; effective_override?: number } = {
        ended_at: ended.toISOString(),
        duration_minutes: dur,
      };
      if (effectiveMinutes >= 0) patch.effective_override = effectiveMinutes;
      const { error } = await supabase
        .from("time_logs")
        .update(patch)
        .eq("id", open.id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timer stopped");
      setEffOpen(false);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isInternal) return null;
  const busy = start.isPending || stop.isPending;

  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (busy) return;
                if (isRunning) setEffOpen(true);
                else start.mutate();
              }}
              className={cn(
                "h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
                isRunning && "text-rose-600 hover:text-rose-700 opacity-100",
                className,
              )}
              aria-label={isRunning ? "Stop timer" : "Start timer"}
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isRunning ? (
                <Square className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isRunning ? `Stop timer · ${elapsed}` : "Start timer"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {isRunning && (
        <span className="text-[10px] font-mono tabular-nums text-rose-600 shrink-0">{elapsed}</span>
      )}
      <EffectiveHoursStopDialog
        open={effOpen}
        onOpenChange={setEffOpen}
        startedAt={open?.started_at}
        pending={stop.isPending}
        onConfirm={(mins) => stop.mutate(mins)}
      />
    </>
  );
}

function useElapsed(startedAt?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return useMemo(() => {
    if (!startedAt) return "00:00";
    const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [now, startedAt]);
}
