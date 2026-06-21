import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";
import { EffectiveHoursStopDialog } from "@/components/ops/effective-hours-stop-dialog";
import { timerRunningKey } from "@/components/ops/timer-widget";

interface OpenSubtaskRow {
  id: string;
  task_id: string;
  subtask_id: string;
  started_at: string;
}

export function subtaskOpenTimerKey(taskId: string, subtaskId: string, userId?: string | null) {
  return ["subtask-open-timer", taskId, subtaskId, userId ?? "anon"] as const;
}

export function SubtaskTimerButton({
  taskId,
  subtaskId,
  disabled,
}: {
  taskId: string;
  subtaskId: string;
  disabled?: boolean;
}) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isInternal = role === "admin" || role === "super_admin" || role === "employee";
  const [effOpen, setEffOpen] = useState(false);

  const queryKey = subtaskOpenTimerKey(taskId, subtaskId, user?.id);

  const { data: open } = useQuery({
    queryKey,
    enabled: !!user && isInternal,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_logs")
        .select("id, task_id, subtask_id, started_at")
        .eq("user_id", user!.id)
        .eq("task_id", taskId)
        .eq("subtask_id", subtaskId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as OpenSubtaskRow | null) ?? null;
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
        subtask_id: subtaskId,
        user_id: user.id,
        started_at: new Date().toISOString(),
      } as never);
      if (error) throw error;
      await supabase.from("task_audit").insert({
        task_id: taskId,
        actor_id: user.id,
        event_type: "subtask_timer_started",
        payload: { subtask_id: subtaskId },
      } as never);
    },
    onSuccess: () => {
      toast.success("Sub-task timer started");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["task-time-sheet", taskId] });
      qc.invalidateQueries({ queryKey: ["task-audit", taskId] });
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
      await supabase.from("task_audit").insert({
        task_id: taskId,
        actor_id: user.id,
        event_type: "subtask_timer_stopped",
        payload: {
          subtask_id: subtaskId,
          duration_minutes: dur,
          effective_minutes: effectiveMinutes >= 0 ? effectiveMinutes : null,
        },
      } as never);
    },
    onSuccess: () => {
      toast.success("Sub-task timer stopped");
      setEffOpen(false);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["task-time-sheet", taskId] });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      qc.invalidateQueries({ queryKey: ["task-audit", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isInternal) return null;

  const busy = start.isPending || stop.isPending;

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("h-7 w-7 shrink-0", isRunning && "text-rose-600 hover:text-rose-700")}
        title={isRunning ? `Stop sub-task timer · ${elapsed}` : "Start sub-task timer"}
        disabled={disabled || busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (busy) return;
          if (isRunning) setEffOpen(true);
          else start.mutate();
        }}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isRunning ? (
          <Square className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </Button>
      {isRunning && (
        <span className="text-[10px] font-mono tabular-nums text-rose-600 tabular-nums">
          {elapsed}
        </span>
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
