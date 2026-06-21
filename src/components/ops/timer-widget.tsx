import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { Play, Square, Loader2, Users, X, Undo2, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { StopChoiceDialog, TimerGroupAvatars } from "@/components/ops/timer-group";
import { EffectiveHoursStopDialog } from "@/components/ops/effective-hours-stop-dialog";
import { isAuthExpiredError } from "@/lib/auth/is-auth-error";
import { useSessionExpiredToast } from "@/lib/auth/use-session-expired-toast";

/** Shared cache key for the user's currently-running timer.
 *  Use everywhere so optimistic updates, rollbacks, and invalidations all hit the same entry. */
export const timerRunningKey = (userId?: string | null) =>
  ["timer-running", userId ?? "anon"] as const;
/** Legacy shared mutation key (kept for back-compat with existing callers). */
export const TIMER_MUTATION_KEY = ["timer-mutation"] as const;
/** Distinct keys so a pending Start never blocks Stop (and vice-versa). */
export const TIMER_START_KEY = ["timer-mutation", "start"] as const;
export const TIMER_STOP_KEY = ["timer-mutation", "stop"] as const;
export const TIMER_FORCE_STOP_KEY = ["timer-mutation", "force-stop"] as const;
/** How long a Stop can stay pending before we surface the Force-Stop recovery affordance. */
export const TIMER_STUCK_THRESHOLD_MS = 8000;

/** Force-stop ALL open timers for the current user. Used by the stuck-recovery flow. */
export async function forceStopAllOpenTimers(userId: string) {
  const endedAt = new Date().toISOString();
  const { data: open, error: selErr } = await supabase
    .from("time_logs")
    .select("id, started_at")
    .eq("user_id", userId)
    .is("ended_at", null);
  if (selErr) throw selErr;
  if (!open || open.length === 0) return 0;
  const now = Date.now();
  for (const row of open) {
    const dur = Math.max(
      1,
      Math.round((now - new Date(row.started_at as string).getTime()) / 60000),
    );
    const { error } = await supabase
      .from("time_logs")
      .update({ ended_at: endedAt, duration_minutes: dur })
      .eq("id", row.id as string)
      .eq("user_id", userId);
    if (error) throw error;
  }
  return open.length;
}

interface RunningRow {
  id: string;
  task_id: string;
  started_at: string;
  timer_group_id?: string | null;
  timer_group_size?: number | null;
}

type Profile = { id: string; full_name: string | null; email: string | null };

export function TimerWidget() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isInternal = role === "admin" || role === "super_admin" || role === "employee";
  const showSessionExpired = useSessionExpiredToast();
  const [rolledBack, setRolledBack] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [effOpen, setEffOpen] = useState(false);

  const { data: running, isLoading: loadingRunning } = useQuery({
    queryKey: timerRunningKey(user?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from("time_logs")
        .select("id, task_id, started_at, timer_group_id, timer_group_size")
        .eq("user_id", user!.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as RunningRow | null) ?? null;
    },
    enabled: !!user && isInternal,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Realtime sync: any insert/update/delete to this user's time_logs invalidates the running query
  // so the header reflects the backend after navigation, multi-tab edits, or background stops.
  useRealtimeChannel(user && isInternal ? `time-logs-${user.id}` : null, (channel) => {
    const uid = user!.id;
    return channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "time_logs", filter: `user_id=eq.${uid}` },
      () => qc.invalidateQueries({ queryKey: timerRunningKey(uid) }),
    );
  });

  const { data: task } = useQuery({
    queryKey: ["timer-task", running?.task_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("id", running!.task_id)
        .single();
      return data;
    },
    enabled: !!running,
  });

  // Admin-configured auto-stop. Default 120 min (2 hours).
  // Closes a forgotten timer at the cap WITHOUT signing the user out.
  const { data: autoStopMin } = useQuery({
    queryKey: ["app-settings", "system", "timer_auto_stop_minutes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("id", "system")
        .maybeSingle();
      const v = (data?.value as { timer_auto_stop_minutes?: number } | null)
        ?.timer_auto_stop_minutes;
      return typeof v === "number" && v >= 15 ? v : 120;
    },
    staleTime: 5 * 60_000,
  });

  const stop = useMutation({
    mutationKey: TIMER_STOP_KEY,
    onMutate: async (_effectiveMinutes?: number) => {
      await qc.cancelQueries({ queryKey: timerRunningKey(user?.id) });
      const previous = qc.getQueryData(timerRunningKey(user?.id));
      qc.setQueryData(timerRunningKey(user?.id), null);
      setRolledBack(false);
      return { previous };
    },
    mutationFn: async (effectiveMinutes?: number) => {
      if (!running) return;
      const ended = new Date();
      const startedAt = new Date(running.started_at);
      const duration = Math.max(1, Math.round((ended.getTime() - startedAt.getTime()) / 60000));
      // Blueprint: hourly bills from effective_override (the user-confirmed billable minutes).
      const patch: { ended_at: string; duration_minutes: number; effective_override?: number } = {
        ended_at: ended.toISOString(),
        duration_minutes: duration,
      };
      if (typeof effectiveMinutes === "number" && effectiveMinutes >= 0) {
        patch.effective_override = effectiveMinutes;
      }
      const { error } = await supabase
        .from("time_logs")
        .update(patch)
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
      qc.invalidateQueries({ queryKey: ["task-time-sheet", running?.task_id] });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx) qc.setQueryData(timerRunningKey(user?.id), ctx.previous);
      if (isAuthExpiredError(e)) {
        showSessionExpired();
        return;
      }
      setRolledBack(true);
      setStuck(true);
      toast.error(`Couldn't stop timer: ${e.message}. Use Force Stop to recover.`, {
        icon: "↩︎",
        duration: 8000,
      });
      setTimeout(() => setRolledBack(false), 4000);
    },
  });

  const forceStop = useMutation({
    mutationKey: TIMER_FORCE_STOP_KEY,
    mutationFn: async () => {
      if (!user) return 0;
      return await forceStopAllOpenTimers(user.id);
    },
    onSuccess: (n) => {
      toast.success(n > 0 ? `Force-stopped ${n} timer${n > 1 ? "s" : ""}` : "No open timers found");
      setStuck(false);
      setRolledBack(false);
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      qc.invalidateQueries({ queryKey: ["task-time"] });
    },
    onError: (e: Error) => {
      toast.error(`Force stop failed: ${e.message}. Please retry or refresh.`, { duration: 10000 });
    },
  });

  // Auto-stop watchdog: once stop is defined, watch the running timer's age.
  useEffect(() => {
    if (!running || !autoStopMin) return;
    const ageMin = (Date.now() - new Date(running.started_at).getTime()) / 60000;
    if (ageMin >= autoStopMin && !stop.isPending) {
      toast.info(`Timer auto-stopped after ${autoStopMin} minutes.`);
      stop.mutate(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.id, running?.started_at, autoStopMin]);

  // Detect a stuck stop: if Stop has been pending past the threshold, expose Force-Stop.
  const stopStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (stop.isPending) {
      stopStartedAtRef.current = Date.now();
      const t = setTimeout(() => setStuck(true), TIMER_STUCK_THRESHOLD_MS);
      return () => clearTimeout(t);
    }
    stopStartedAtRef.current = null;
  }, [stop.isPending]);

  const elapsed = useElapsed(running?.started_at);

  // Skeleton while initial fetch resolves so the header doesn't flash
  if (isInternal && loadingRunning && !running) {
    return <Skeleton className="hidden md:block h-7 w-44 rounded-md" />;
  }
  if (!isInternal || !running) return null;

  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (stop.isPending) return;
    if (running.timer_group_id) {
      setChoiceOpen(true);
      return;
    }
    // Blueprint: confirm Effective Hours before persisting the stop.
    setEffOpen(true);
  };
  const handleForceStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (forceStop.isPending) return;
    forceStop.mutate();
  };

  return (
    <div className="hidden md:flex items-center gap-2 rounded-md border border-border bg-accent/40 px-2 py-1">
      <span
        className={`h-2 w-2 rounded-full ${rolledBack ? "bg-amber-500" : "bg-emerald-500"} animate-pulse`}
      />
      <Link
        to="/ops/tasks/$taskId"
        params={{ taskId: running.task_id }}
        className="text-xs font-medium max-w-[160px] truncate hover:text-primary"
      >
        {task?.title ?? "Running…"}
      </Link>
      <span className="text-xs font-mono tabular-nums text-muted-foreground">{elapsed}</span>
      <TimerGroupAvatars groupId={running.timer_group_id} currentUserId={user?.id} />
      {stop.isPending ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </span>
      ) : rolledBack ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600">
          <Undo2 className="h-3 w-3" /> Rolled back
        </span>
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        onClick={handleStop}
        disabled={stop.isPending}
        title={running.timer_group_id ? "Stop timer (choose just me / everyone)" : "Stop timer"}
        data-testid="header-timer-stop"
      >
        {stop.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Square className="h-3 w-3" />
        )}
      </Button>
      {stuck && (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-6 px-2 gap-1 text-[10px]"
          onClick={handleForceStop}
          disabled={forceStop.isPending}
          title="Force-stop all running timers (recovery)"
          data-testid="header-timer-force-stop"
        >
          {forceStop.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          Force stop
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
      <EffectiveHoursStopDialog
        open={effOpen}
        onOpenChange={setEffOpen}
        startedAt={running.started_at}
        pending={stop.isPending}
        onConfirm={(mins) => {
          stop.mutate(mins, { onSuccess: () => setEffOpen(false) });
        }}
      />
    </div>
  );
}

// Helper: count timer mutations currently in-flight in this client.
function useIsMutatingCount(qc: ReturnType<typeof useQueryClient>) {
  return qc.getMutationCache().findAll({ mutationKey: TIMER_MUTATION_KEY, status: "pending" })
    .length;
}

export function TaskTimerControl({
  taskId,
  compact = false,
}: {
  taskId: string;
  compact?: boolean;
}) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isInternal = role === "admin" || role === "super_admin" || role === "employee";
  const showSessionExpired = useSessionExpiredToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [effOpen, setEffOpen] = useState(false);

  const inflight = useIsMutating({ mutationKey: TIMER_MUTATION_KEY }) > 0;
  const [rolledBack, setRolledBack] = useState<"start" | "stop" | null>(null);

  const { data: running, isLoading: loadingRunning } = useQuery({
    queryKey: timerRunningKey(user?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from("time_logs")
        .select("id, task_id, started_at, timer_group_id, timer_group_size")
        .eq("user_id", user!.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as RunningRow | null) ?? null;
    },
    enabled: !!user && isInternal,
  });

  const start = useMutation({
    mutationKey: TIMER_START_KEY,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: timerRunningKey(user?.id) });
      const previous = qc.getQueryData(timerRunningKey(user?.id));
      qc.setQueryData(timerRunningKey(user?.id), {
        id: `optimistic-${Date.now()}`,
        task_id: taskId,
        started_at: new Date().toISOString(),
      } as RunningRow);
      setRolledBack(null);
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx) qc.setQueryData(timerRunningKey(user?.id), ctx.previous);
      if (isAuthExpiredError(e)) {
        showSessionExpired();
        return;
      }
      setRolledBack("start");
      toast.error(`Couldn't start timer — rolled back. ${e.message}`, { icon: "↩︎" });
      setTimeout(() => setRolledBack(null), 2500);
    },
    mutationFn: async (collaboratorIds: string[]) => {
      if (!user) return;
      // Stop any running timer for me first
      if (running) {
        const ended = new Date();
        const dur = Math.max(
          1,
          Math.round((ended.getTime() - new Date(running.started_at).getTime()) / 60000),
        );
        await supabase
          .from("time_logs")
          .update({ ended_at: ended.toISOString(), duration_minutes: dur })
          .eq("id", running.id)
          .eq("user_id", user.id);
      }
      const startedAt = new Date().toISOString();
      const userIds = Array.from(new Set([user.id, ...collaboratorIds]));
      const timerGroupId =
        userIds.length > 1
          ? typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2) + Date.now().toString(36)
          : null;

      const rows = userIds.map((uid) => ({
        task_id: taskId,
        user_id: uid,
        started_at: startedAt,
        timer_group_id: timerGroupId,
        timer_group_size: userIds.length,
      }));
      const { error } = await supabase.from("time_logs").insert(rows);
      if (error) throw error;
    },
    onSuccess: (_d, collaboratorIds) => {
      const extra = collaboratorIds.length;
      toast.success(
        extra > 0
          ? `Timer started for you + ${extra} collaborator${extra > 1 ? "s" : ""}`
          : "Timer started",
      );
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["task-time", taskId] });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      setPickerOpen(false);
    },
  });

  const stop = useMutation({
    mutationKey: TIMER_STOP_KEY,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: timerRunningKey(user?.id) });
      const previous = qc.getQueryData(timerRunningKey(user?.id));
      qc.setQueryData(timerRunningKey(user?.id), null);
      setRolledBack(null);
      return { previous };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx) qc.setQueryData(timerRunningKey(user?.id), ctx.previous);
      if (isAuthExpiredError(e)) {
        showSessionExpired();
        return;
      }
      setRolledBack("stop");
      toast.error(`Couldn't stop timer — rolled back. ${e.message}`, { icon: "↩︎" });
      setTimeout(() => setRolledBack(null), 2500);
    },
    mutationFn: async (effectiveMinutes?: number) => {
      if (!running) return;
      const ended = new Date();
      const dur = Math.max(
        1,
        Math.round((ended.getTime() - new Date(running.started_at).getTime()) / 60000),
      );
      const patch: { ended_at: string; duration_minutes: number; effective_override?: number } = {
        ended_at: ended.toISOString(),
        duration_minutes: dur,
      };
      if (typeof effectiveMinutes === "number" && effectiveMinutes >= 0) {
        patch.effective_override = effectiveMinutes;
      }
      const { error } = await supabase
        .from("time_logs")
        .update(patch)
        .eq("id", running.id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timer stopped");
      qc.invalidateQueries({ queryKey: timerRunningKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["task-time", taskId] });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
    },
  });

  const isThisRunning = running?.task_id === taskId;
  const elapsed = useElapsed(isThisRunning ? running?.started_at : undefined);
  const busy = start.isPending || stop.isPending || inflight;
  const stopBusy = stop.isPending; // Stop must never be blocked by a sibling start.

  if (!isInternal) return null;
  if (loadingRunning && !running) {
    return <Skeleton className={compact ? "h-7 w-7 rounded-md" : "h-9 w-28 rounded-md"} />;
  }

  const openPicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setPickerOpen(true);
  };
  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (stopBusy) return;
    if (running?.timer_group_id) {
      setChoiceOpen(true);
      return;
    }
    setEffOpen(true);
  };

  const statusLabel = stop.isPending
    ? "Saving…"
    : start.isPending
      ? "Saving…"
      : rolledBack
        ? "Rolling back…"
        : null;

  if (isThisRunning) {
    const stopBtn = compact ? (
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-7 w-7 shrink-0"
        title={
          statusLabel ??
          (running?.timer_group_id ? "Stop (just me / everyone)" : `Stop · ${elapsed}`)
        }
        onClick={handleStop}
        disabled={stopBusy}
      >
        {stop.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Square className="h-3 w-3 text-rose-600" />
        )}
      </Button>
    ) : (
      <Button
        type="button"
        variant="outline"
        onClick={handleStop}
        disabled={stopBusy}
        className="gap-2"
      >
        {stop.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Square className="h-3.5 w-3.5 text-rose-600" />
        )}
        {statusLabel ?? (
          <>
            Stop · <span className="font-mono tabular-nums">{elapsed}</span>
          </>
        )}
      </Button>
    );
    return (
      <>
        <div className="inline-flex items-center gap-2">
          {stopBtn}
          <TimerGroupAvatars groupId={running?.timer_group_id} currentUserId={user?.id} max={3} />
        </div>
        {running?.timer_group_id && user && (
          <StopChoiceDialog
            open={choiceOpen}
            onOpenChange={setChoiceOpen}
            groupId={running.timer_group_id}
            currentUserId={user.id}
            taskId={taskId}
            runningId={running.id}
            startedAt={running.started_at}
          />
        )}
        <EffectiveHoursStopDialog
          open={effOpen}
          onOpenChange={setEffOpen}
          startedAt={running?.started_at}
          pending={stop.isPending}
          onConfirm={(mins) => stop.mutate(mins, { onSuccess: () => setEffOpen(false) })}
        />
      </>
    );
  }

  return (
    <>
      {compact ? (
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7 shrink-0"
          title={statusLabel ?? "Start timer"}
          onClick={openPicker}
          disabled={busy}
        >
          {start.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3 text-emerald-600" />
          )}
        </Button>
      ) : (
        <Button variant="outline" onClick={openPicker} disabled={busy} className="gap-2">
          {start.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 text-emerald-600" />
          )}
          {statusLabel ?? "Start timer"}
        </Button>
      )}
      <CollaboratorPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentUserId={user?.id ?? ""}
        pending={start.isPending}
        onConfirm={(ids) => start.mutate(ids)}
      />
    </>
  );
}

function CollaboratorPicker({
  open,
  onOpenChange,
  currentUserId,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUserId: string;
  pending: boolean;
  onConfirm: (collaboratorIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const { data: profiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ["collab-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, status")
        .neq("status", "disabled")
        .order("full_name");
      return ((data ?? []) as (Profile & { status?: string })[]).filter(
        (p) => p.id !== currentUserId,
      );
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setQ("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (profiles ?? []).filter((p) => {
      if (!s) return true;
      return (
        (p.full_name ?? "").toLowerCase().includes(s) || (p.email ?? "").toLowerCase().includes(s)
      );
    });
  }, [profiles, q]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Working with you?
          </DialogTitle>
          <DialogDescription>
            Pick teammates pairing on this task. A timer will start for you and each selected
            collaborator so everyone gets credit.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search teammates…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9"
        />

        {selected.size > 0 && (
          <div className="flex flex-wrap gap-1.5 rounded-md border bg-accent/30 p-2">
            {Array.from(selected).map((id) => {
              const p = profiles?.find((x) => x.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5"
                >
                  {p?.full_name || p?.email || id.slice(0, 6)}
                  <button
                    type="button"
                    className="hover:text-destructive"
                    onClick={() => toggle(id)}
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <ScrollArea className="h-64 rounded-md border">
          <div className="p-2 space-y-1">
            {loadingProfiles ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No teammates found.</p>
            ) : (
              filtered.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
                >
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{p.full_name || p.email}</div>
                    {p.full_name && (
                      <div className="text-[11px] text-muted-foreground truncate">{p.email}</div>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onConfirm([])} disabled={pending}>
            Just me
          </Button>
          <Button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={pending}
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {selected.size > 0 ? `Start (you + ${selected.size})` : "Start (just me)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
