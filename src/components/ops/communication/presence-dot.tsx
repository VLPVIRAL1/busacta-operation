import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";

/**
 * Visual presence dot driven by `chat_presence`.
 * - online: green
 * - away: amber (no heartbeat for >2 minutes)
 * - offline: hidden
 *
 * Cheap: fetches the single row on mount, refetches every 60s.
 */
export function PresenceDot({
  userId,
  className,
}: {
  userId: string | null | undefined;
  className?: string;
}) {
  const q = useQuery({
    queryKey: ["presence", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("chat_presence")
        .select("status,last_seen_at")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
  });

  if (!q.data?.last_seen_at) return null;
  const seenMs = Date.now() - new Date(q.data.last_seen_at).getTime();
  const stale = seenMs > 2 * 60_000;
  const status: "online" | "away" | "offline" = stale
    ? "offline"
    : q.data.status === "away"
      ? "away"
      : "online";
  if (status === "offline") return null;

  return (
    <span
      aria-label={status}
      title={status === "online" ? "Online" : "Away"}
      className={cn(
        "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
        status === "online" ? "bg-emerald-500" : "bg-amber-500",
        className,
      )}
    />
  );
}
