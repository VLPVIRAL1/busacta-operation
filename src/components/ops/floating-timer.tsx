import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Square, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  TIMER_FORCE_STOP_KEY,
  TIMER_STOP_KEY,
  TIMER_STUCK_THRESHOLD_MS,
  forceStopAllOpenTimers,
  timerRunningKey,
} from "@/components/ops/timer-widget";
import { StopChoiceDialog, TimerGroupAvatars } from "@/components/ops/timer-group";
import { isAuthExpiredError } from "@/lib/auth/is-auth-error";
import { useSessionExpiredToast } from "@/lib/auth/use-session-expired-toast";

type RunningRow = {
  id: string;
  task_id: string;
  started_at: string;
  timer_group_id: string | null;
};

/**
 * Globally-mounted floating timer pill.
 * Shown on every route whenever the user has an open timer, so Stop is always
 * reachable even when the header is hidden (mobile, fullscreen dialogs, etc).
 */
export function FloatingTimer() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isInternal = role === "admin" || role === "super_admin" || role === "employee";
  const showSessionExpired = useSessionExpiredToast();
  const [stuck, setStuck] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);

  const { data: running } = useQuery({
    queryKey: timerRunningKey(user?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from("time_logs")
        .select("id, task_id, started_at, timer_group_id")
        .eq("user_id", user!.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as RunningRow | null) ?? null;
    },
    enabled: !!user && isInternal,
    refetchInterval: 30000,
  });

  const { data: task } = useQuery({
    queryKey: ["timer-task", running?.task_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("id", running!.task_id)
        .single();
      return data as { id: string; title: string } | null;
    },
    enabled: !!running,
  });

  const stop = useMutation({
    mutationKey: TIMER_STOP_KEY,
    mutationFn: async () => {
      if (!running) return;
      const ended = new Date();
      const dur = Math.max(
        1,
        Math.round((ended.getTime() - new Date(running.started_at).getTime()) / 60000),
      );
      const { error } = await supabase
        .from("time_logs")
        .update({ ended_at: ended.toISOString(), duration_minutes: dur })
        .eq("id", running.id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timer stopped");
      setStuck(false);
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      qc.invalidateQueries({ queryKey: ["task-time"] });
    },
    onError: (e: Error) => {
      if (isAuthExpiredError(e)) {
        showSessionExpired();
        return;
      }
      setStuck(true);
      toast.error(`Couldn't stop timer: ${e.message}. Use Force Stop to recover.`, {
        duration: 8000,
      });
    },
  });

  const forceStop = useMutation({
    mutationKey: TIMER_FORCE_STOP_KEY,
    mutationFn: async () => (user ? forceStopAllOpenTimers(user.id) : 0),
    onSuccess: (n) => {
      toast.success(n > 0 ? `Force-stopped ${n} timer${n > 1 ? "s" : ""}` : "No open timers found");
      setStuck(false);
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      qc.invalidateQueries({ queryKey: ["task-time"] });
    },
    onError: (e: Error) => toast.error(`Force stop failed: ${e.message}`, { duration: 8000 }),
  });

  // Surface Force-Stop after a stuck threshold.
  const stopStartedRef = useRef<number | null>(null);
  useEffect(() => {
    if (stop.isPending) {
      stopStartedRef.current = Date.now();
      const t = setTimeout(() => setStuck(true), TIMER_STUCK_THRESHOLD_MS);
      return () => clearTimeout(t);
    }
    stopStartedRef.current = null;
  }, [stop.isPending]);

  const elapsed = useElapsed(running?.started_at);
  if (!isInternal || !user || !running) return null;

  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (stop.isPending) return;
    if (running.timer_group_id) {
      setChoiceOpen(true);
      return;
    }
    stop.mutate();
  };
  const handleForceStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (forceStop.isPending) return;
    forceStop.mutate();
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 shadow-lg backdrop-blur md:hidden"
      data-testid="floating-timer"
    >
      <Timer className="h-3.5 w-3.5 text-emerald-600" />
      <Link
        to="/ops/tasks/$taskId"
        params={{ taskId: running.task_id }}
        className="max-w-[120px] truncate text-xs font-medium hover:text-primary"
      >
        {task?.title ?? "Running…"}
      </Link>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{elapsed}</span>
      <TimerGroupAvatars groupId={running.timer_group_id} currentUserId={user?.id} max={2} />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        onClick={handleStop}
        disabled={stop.isPending}
        title={running.timer_group_id ? "Stop timer (choose just me / everyone)" : "Stop timer"}
        data-testid="floating-timer-stop"
      >
        {stop.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Square className="h-3 w-3 text-rose-600" />
        )}
      </Button>
      {stuck && (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-6 gap-1 px-2 text-[10px]"
          onClick={handleForceStop}
          disabled={forceStop.isPending}
          title="Force-stop all running timers"
          data-testid="floating-timer-force-stop"
        >
          {forceStop.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          Force
        </Button>
      )}
      {running.timer_group_id && user && (
        <StopChoiceDialog
          open={choiceOpen}
          onOpenChange={setChoiceOpen}
          groupId={running.timer_group_id}
          currentUserId={user.id}
          taskId={running.task_id}
          runningId={running.id}
          startedAt={running.started_at}
        />
      )}
    </div>
  );
}

function useElapsed(startedAt?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return "0:00";
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
