/**
 * Communication realtime helpers.
 *
 * - useInboxRealtime: subscribes to chat_messages + task_messages inserts and
 *   invalidates the unified inbox summary so unread counts + previews update
 *   live across tabs.
 * - useTypingChannel: per-thread broadcast channel for ephemeral typing
 *   indicators (3s timeout per user).
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const INVALIDATE_DEBOUNCE_MS = 600;

export function useInboxRealtime(userId: string | null) {
  const qc = useQueryClient();
  // Unique per hook-instance so two mounts (header badge + inbox page) don't
  // collide on the same channel name and trigger
  // "cannot add postgres_changes callbacks after subscribe()".
  const instanceId = useRef<string>(Math.random().toString(36).slice(2, 10));
  useEffect(() => {
    if (!userId) return;
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void qc.invalidateQueries({
          predicate: (q) => q.queryKey?.[0] === "inbox",
        });
      }, INVALIDATE_DEBOUNCE_MS);
    };
    const channel = supabase
      .channel(`inbox-${userId}-${instanceId.current}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, bump)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_messages" }, bump)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

export interface TypingUser {
  userId: string;
  name: string;
  at: number;
}

export function useTypingChannel(
  topic: string | null,
  selfUserId: string | null,
  selfName: string,
) {
  const [typers, setTypers] = useState<TypingUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!topic || !selfUserId) return;
    const ch = supabase
      .channel(`typing-${topic}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as TypingUser;
        if (!p?.userId || p.userId === selfUserId) return;
        setTypers((prev) => {
          const filtered = prev.filter((t) => t.userId !== p.userId);
          return [...filtered, { ...p, at: Date.now() }];
        });
      })
      .subscribe();
    channelRef.current = ch;

    // Cull stale typers every second.
    const cull = window.setInterval(() => {
      setTypers((prev) => prev.filter((t) => Date.now() - t.at < 3500));
    }, 1000);

    return () => {
      window.clearInterval(cull);
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [topic, selfUserId]);

  const sendTyping = () => {
    if (!channelRef.current || !selfUserId) return;
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return; // throttle
    lastSentRef.current = now;
    void channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: selfUserId, name: selfName, at: now } satisfies TypingUser,
    });
  };

  return { typers, sendTyping };
}
