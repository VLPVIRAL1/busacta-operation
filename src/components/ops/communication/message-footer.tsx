import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Smile, Star } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";
import {
  toggleReaction,
  toggleStar,
  fetchReactions,
  fetchStars,
  fetchSeen,
  type CommScope,
} from "@/lib/ops/comm-extras";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🙏", "👀", "🔥", "✅"];

export function useMessageFooterData(scope: CommScope, messageIds: string[]) {
  const reactionsQ = useQuery({
    queryKey: ["msg-reactions", scope, messageIds.join(",")],
    enabled: messageIds.length > 0,
    queryFn: () => fetchReactions(scope, messageIds),
  });
  const starsQ = useQuery({
    queryKey: ["msg-stars", scope, messageIds.join(",")],
    enabled: messageIds.length > 0,
    queryFn: () => fetchStars(scope, messageIds),
  });
  const seenQ = useQuery({
    queryKey: ["msg-seen", scope, messageIds.join(",")],
    enabled: messageIds.length > 0,
    queryFn: () => fetchSeen(scope, messageIds),
  });
  return { reactionsQ, starsQ, seenQ };
}

export function MessageFooter({
  scope,
  messageId,
  mine,
  invalidateKeys,
}: {
  scope: CommScope;
  messageId: string;
  mine: boolean;
  invalidateKeys: readonly unknown[][];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Pull from the batched footer data already in the query cache.
  const reactionsAll = qc.getQueriesData<Awaited<ReturnType<typeof fetchReactions>>>({
    queryKey: ["msg-reactions", scope],
  });
  const starsAll = qc.getQueriesData<Set<string>>({ queryKey: ["msg-stars", scope] });
  const seenAll = qc.getQueriesData<Awaited<ReturnType<typeof fetchSeen>>>({
    queryKey: ["msg-seen", scope],
  });

  const reactions = (reactionsAll.flatMap(([, v]) => v ?? []) ?? []).filter(
    (r) => r.message_id === messageId,
  );
  const starred = starsAll.some(([, set]) => set?.has(messageId));
  const seenUsers = (seenAll.flatMap(([, v]) => v ?? []) ?? []).filter(
    (r) => r.message_id === messageId && r.user_id !== user?.id,
  );

  const grouped = reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
    acc[r.emoji].count += 1;
    if (r.user_id === user?.id) acc[r.emoji].mine = true;
    return acc;
  }, {});

  const invalidate = () => {
    for (const k of invalidateKeys) void qc.invalidateQueries({ queryKey: k });
  };

  const reactMut = useMutation({
    mutationFn: (emoji: string) => toggleReaction(scope, messageId, emoji),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const starMut = useMutation({
    mutationFn: () => toggleStar(scope, messageId),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={cn("mt-1 flex flex-wrap items-center gap-1", mine && "justify-end")}>
      {Object.entries(grouped).map(([emoji, info]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => reactMut.mutate(emoji)}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] leading-none",
            info.mine
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-foreground hover:bg-accent",
          )}
        >
          <span>{emoji}</span>
          <span>{info.count}</span>
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add reaction"
            className="rounded-full border bg-background p-0.5 text-muted-foreground opacity-60 hover:opacity-100"
          >
            <Smile className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1" align="start">
          <div className="flex gap-0.5">
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  reactMut.mutate(e);
                  setOpen(false);
                }}
                className="rounded p-1 text-base hover:bg-accent"
              >
                {e}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={() => starMut.mutate()}
        aria-label={starred ? "Unstar" : "Star"}
        className={cn(
          "rounded-full border bg-background p-0.5 opacity-60 hover:opacity-100",
          starred && "text-amber-500 opacity-100",
        )}
      >
        <Star className={cn("h-3 w-3", starred && "fill-current")} />
      </button>
      {mine && seenUsers.length > 0 && (
        <span className="ml-1 text-[10px] text-muted-foreground">Seen by {seenUsers.length}</span>
      )}
    </div>
  );
}
