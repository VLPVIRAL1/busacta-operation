import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Square, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TIMER_STOP_KEY, timerRunningKey } from "@/components/ops/timer-widget";

type Member = { user_id: string; full_name: string | null; email: string | null };

/** Fetches all collaborators (incl. caller) currently running a timer in `groupId`. */
export function useTimerGroupMembers(groupId: string | null | undefined) {
  return useQuery({
    queryKey: ["timer-group-members", groupId ?? "none"],
    enabled: !!groupId,
    queryFn: async (): Promise<Member[]> => {
      const { data: rows } = await supabase
        .from("time_logs")
        .select("user_id")
        .eq("timer_group_id", groupId!)
        .is("ended_at", null);
      const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id as string)));
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const byId = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      return ids.map((uid) => ({
        user_id: uid,
        full_name: byId[uid]?.full_name ?? null,
        email: byId[uid]?.email ?? null,
      }));
    },
    refetchInterval: 30000,
  });
}

function initials(m: Member) {
  const s = m.full_name || m.email || "?";
  return s
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Compact avatar stack of group members, with a "+N" overflow chip. */
export function TimerGroupAvatars({
  groupId,
  currentUserId,
  max = 3,
}: {
  groupId: string | null | undefined;
  currentUserId: string | null | undefined;
  max?: number;
}) {
  const { data } = useTimerGroupMembers(groupId);
  if (!groupId || !data || data.length <= 1) return null;
  const ordered = [...data].sort((a, b) =>
    a.user_id === currentUserId ? -1 : b.user_id === currentUserId ? 1 : 0,
  );
  const shown = ordered.slice(0, max);
  const overflow = ordered.length - shown.length;
  const names = ordered
    .map((m) => (m.user_id === currentUserId ? "you" : m.full_name || m.email || "teammate"))
    .join(", ");
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`Working together: ${names}`}
      data-testid="timer-group-avatars"
    >
      <span className="flex -space-x-1.5">
        {shown.map((m) => (
          <span
            key={m.user_id}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-background bg-primary/15 text-[9px] font-semibold text-primary"
          >
            {initials(m)}
          </span>
        ))}
        {overflow > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-background bg-muted px-1 text-[9px] font-semibold text-muted-foreground">
            +{overflow}
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Users className="h-3 w-3" /> Team · {ordered.length}
      </span>
    </span>
  );
}

/** Confirmation dialog: stop just me, or stop everyone in the group. */
export function StopChoiceDialog({
  open,
  onOpenChange,
  groupId,
  currentUserId,
  taskId,
  runningId,
  startedAt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  currentUserId: string;
  taskId: string;
  runningId: string;
  startedAt: string;
}) {
  const qc = useQueryClient();
  const { data: members } = useTimerGroupMembers(groupId);
  const others = (members ?? []).filter((m) => m.user_id !== currentUserId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: timerRunningKey(currentUserId) });
    qc.invalidateQueries({ queryKey: ["timer-group-members", groupId] });
    qc.invalidateQueries({ queryKey: ["time-logs"] });
    qc.invalidateQueries({ queryKey: ["task-time"] });
    qc.invalidateQueries({ queryKey: ["task-time-sheet", taskId] });
  };

  const stopMine = useMutation({
    mutationKey: TIMER_STOP_KEY,
    mutationFn: async () => {
      const ended = new Date();
      const dur = Math.max(
        1,
        Math.round((ended.getTime() - new Date(startedAt).getTime()) / 60000),
      );
      const { error } = await supabase
        .from("time_logs")
        .update({ ended_at: ended.toISOString(), duration_minutes: dur })
        .eq("id", runningId)
        .eq("user_id", currentUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stopped your timer");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(`Couldn't stop timer: ${e.message}`),
  });

  const stopAll = useMutation({
    mutationKey: ["timer-stop-group", groupId],
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("stop_timer_group", { _group_id: groupId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (n) => {
      toast.success(`Stopped timer for ${n} teammate${n === 1 ? "" : "s"}`);
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(`Couldn't stop everyone: ${e.message}`),
  });

  const busy = stopMine.isPending || stopAll.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Stop multi-person timer
          </DialogTitle>
          <DialogDescription>
            You're tracking time with{" "}
            <span className="font-medium text-foreground">
              {others.length === 0
                ? "your teammates"
                : others.map((m) => m.full_name || m.email || "teammate").join(", ")}
            </span>
            . What would you like to do?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => stopMine.mutate()}
            disabled={busy}
          >
            {stopMine.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4 text-rose-600" />
            )}
            Stop just me
            <span className="ml-auto text-[11px] text-muted-foreground">
              Teammates keep tracking
            </span>
          </Button>
          <Button
            variant="destructive"
            className="w-full justify-start gap-2"
            onClick={() => stopAll.mutate()}
            disabled={busy}
          >
            {stopAll.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            Stop everyone
            <span className="ml-auto text-[11px] opacity-80">
              Ends {(others.length || 0) + 1} timer{others.length === 0 ? "" : "s"}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
