import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Square, Timer } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { isAuthExpiredError } from "@/lib/auth/is-auth-error";
import { useSessionExpiredToast } from "@/lib/auth/use-session-expired-toast";
import { timerRunningKey } from "@/components/ops/timer-widget";

type RecoveryRow = {
  id: string;
  task_id: string;
  started_at: string;
  timer_group_id: string | null;
};

const SESSION_DISMISS_KEY = "timer-recovery-dismissed";

/**
 * After a fresh sign-in, if the user has an open `time_logs` row left running
 * from a previous session/tab, surface a one-click recovery prompt so they
 * can stop it without hunting for the task. Shown at most once per browser
 * session and only when the timer is older than 2 minutes (so a normal active
 * session doesn't trigger it).
 */
export function TimerRecoveryPrompt() {
  const { user, role, loading } = useAuth();
  const qc = useQueryClient();
  const isInternal = role === "admin" || role === "super_admin" || role === "employee";
  const showSessionExpired = useSessionExpiredToast();
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<RecoveryRow | null>(null);

  const { data: running } = useQuery({
    queryKey: ["timer-recovery", user?.id],
    enabled: !!user && isInternal && !loading,
    queryFn: async () => {
      const { data } = await supabase
        .from("time_logs")
        .select("id, task_id, started_at, timer_group_id")
        .eq("user_id", user!.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as RecoveryRow | null) ?? null;
    },
    staleTime: 30_000,
  });

  // Open the prompt once per browser session when a stale timer is found.
  useEffect(() => {
    if (!running || !user) return;
    if (typeof window === "undefined") return;
    const key = `${SESSION_DISMISS_KEY}:${user.id}:${running.id}`;
    if (sessionStorage.getItem(key)) return;
    const ageMin = (Date.now() - new Date(running.started_at).getTime()) / 60000;
    if (ageMin < 2) return; // ignore brand-new timers (normal flow)
    setRow(running);
    setOpen(true);
  }, [running, user]);

  const { data: task } = useQuery({
    queryKey: ["timer-recovery-task", row?.task_id],
    enabled: !!row,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("id", row!.task_id)
        .single();
      return data as { id: string; title: string } | null;
    },
  });

  const stop = useMutation({
    mutationFn: async () => {
      if (!row || !user) return;
      const ended = new Date();
      const dur = Math.max(
        1,
        Math.round((ended.getTime() - new Date(row.started_at).getTime()) / 60000),
      );
      const { error } = await supabase
        .from("time_logs")
        .update({ ended_at: ended.toISOString(), duration_minutes: dur })
        .eq("id", row.id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recovered — timer stopped");
      dismiss();
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["timer-recovery", user?.id] });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
    },
    onError: (e: Error) => {
      if (isAuthExpiredError(e)) {
        showSessionExpired();
        setOpen(false);
        return;
      }
      toast.error(`Couldn't stop timer: ${e.message}`);
    },
  });

  function dismiss() {
    if (row && user && typeof window !== "undefined") {
      sessionStorage.setItem(`${SESSION_DISMISS_KEY}:${user.id}:${row.id}`, "1");
    }
    setOpen(false);
  }

  if (!isInternal || !user || !row) return null;

  const startedAt = new Date(row.started_at);
  const elapsedMin = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000));
  const h = Math.floor(elapsedMin / 60);
  const m = elapsedMin % 60;
  const elapsedLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!stop.isPending && !v) dismiss();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-emerald-600" />
            Recover running timer
          </DialogTitle>
          <DialogDescription>
            A timer has been running since your last session. Stop it in one click, or keep it
            running and manage it from the task page.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-accent/40 px-3 py-2 text-sm">
          <div className="font-medium truncate">{task?.title ?? "Loading task…"}</div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Started {startedAt.toLocaleString()}</span>
            <span className="font-mono tabular-nums">{elapsedLabel}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button asChild variant="ghost" onClick={() => dismiss()} disabled={stop.isPending}>
            <Link to="/ops/tasks/$taskId" params={{ taskId: row.task_id }}>
              Open task
            </Link>
          </Button>
          <Button variant="outline" onClick={() => dismiss()} disabled={stop.isPending}>
            Keep running
          </Button>
          <Button onClick={() => stop.mutate()} disabled={stop.isPending} className="gap-2">
            {stop.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            Stop now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
