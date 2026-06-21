import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Radio, Square, ExternalLink, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { liveTrackQuery, type LiveTrackUser } from "@/lib/queries/global-dashboard.queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { toast } from "sonner";

export function TabLiveTrack() {
  const qc = useQueryClient();
  const [, force] = useState(0);

  const { data: users = [] } = useQuery({
    ...liveTrackQuery(),
    refetchInterval: 10_000,
  });

  // Tick every second to keep elapsed timers live
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime invalidation on time_logs changes
  useEffect(() => {
    const ch = supabase
      .channel("live-track-time-logs")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["global-dashboard", "live-track"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const forceStop = useMutation({
    mutationFn: async (log: NonNullable<LiveTrackUser["running_log"]>) => {
      const now = new Date();
      const startedAt = new Date(log.started_at);
      const minutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));
      const { error } = await supabase
        .from("time_logs")
        .update({ ended_at: now.toISOString(), duration_minutes: minutes })
        .eq("id", log.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timer stopped");
      qc.invalidateQueries({ queryKey: ["global-dashboard", "live-track"] });
    },
    onError: (e) => toast.error("Failed to stop timer", { description: (e as Error).message }),
  });

  const running = users.filter((u) => u.running_log);
  const online = users.filter((u) => !u.running_log && u.status === "online");
  const away = users.filter((u) => !u.running_log && u.status !== "online");

  return (
    <div className="h-full min-h-0 flex flex-col border rounded-lg overflow-hidden bg-background">
      <header className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 animate-pulse text-emerald-600" />
          <h2 className="text-sm font-semibold">Live Track</h2>
          <span className="text-[11px] text-muted-foreground">
            {running.length} running · {online.length} online · {away.length} away
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">Refreshes every 10s</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-6">
        <Group title="Running Timers" tone="emerald" items={running}>
          {(u) => (
            <UserCard
              key={u.user_id}
              u={u}
              canStop={true}
              onStop={() => forceStop.mutate(u.running_log!)}
            />
          )}
        </Group>
        <Group title="Online" tone="blue" items={online}>
          {(u) => <UserCard key={u.user_id} u={u} canStop={false} onStop={() => {}} />}
        </Group>
        <Group title="Away / Offline" tone="muted" items={away}>
          {(u) => <UserCard key={u.user_id} u={u} canStop={false} onStop={() => {}} muted />}
        </Group>
      </div>
    </div>
  );
}

function Group({
  title,
  tone,
  items,
  children,
}: {
  title: string;
  tone: "emerald" | "blue" | "muted";
  items: LiveTrackUser[];
  children: (u: LiveTrackUser) => React.ReactNode;
}) {
  const dot =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "blue"
        ? "bg-blue-500"
        : "bg-muted-foreground/40";
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        {title}
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal">
          {items.length}
        </span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {items.map(children)}
        </div>
      )}
    </section>
  );
}

function UserCard({
  u,
  canStop,
  onStop,
  muted,
}: {
  u: LiveTrackUser;
  canStop: boolean;
  onStop: () => void;
  muted?: boolean;
}) {
  const initials = (u.full_name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        muted && "opacity-60",
      )}
    >
      <Avatar className="h-10 w-10">
        {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.full_name ?? "user"} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{u.full_name ?? "Unknown"}</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Circle
              className={cn(
                "h-2 w-2 fill-current",
                u.status === "online" ? "text-emerald-500" : "text-muted-foreground",
              )}
            />
            {u.status}
          </span>
        </div>
        {u.running_log ? (
          <div className="mt-1">
            <Link
              to="/ops/tasks/$taskId"
              params={{ taskId: u.running_log.task_id }}
              className="block truncate text-xs font-medium hover:underline"
            >
              {u.running_log.task_display_id && (
                <span className="mr-1 text-muted-foreground">{u.running_log.task_display_id}</span>
              )}
              {u.running_log.task_title ?? "Untitled task"}
              <ExternalLink className="ml-1 inline h-3 w-3 opacity-50" />
            </Link>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-sm tabular-nums text-emerald-600">
                {elapsed(u.running_log.started_at)}
              </span>
              {canStop && (
                <Button size="sm" variant="outline" className="h-6 gap-1 text-xs" onClick={onStop}>
                  <Square className="h-3 w-3" /> Stop
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last seen {formatDistanceToNow(parseISO(u.last_seen_at), { addSuffix: true })}
          </p>
        )}
      </div>
    </div>
  );
}

function elapsed(startISO: string): string {
  const diff = Date.now() - new Date(startISO).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}
