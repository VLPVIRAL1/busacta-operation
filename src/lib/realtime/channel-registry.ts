import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Refcounted Supabase realtime channel registry.
 *
 * Multiple components can ask for the same logical channel (e.g. two widgets
 * both watching `notif-<userId>`). Without a registry, each call opens a
 * separate WebSocket subscription, and a missed cleanup leaks listeners on
 * every navigation. The registry guarantees:
 *
 * - At most one underlying `supabase.channel` per key per session.
 * - Subscribers share that channel; the last subscriber to release it
 *   removes the channel from Supabase.
 * - `flush()` tears down everything (call on sign-out).
 */

type Builder = (channel: RealtimeChannel) => RealtimeChannel;

interface Entry {
  channel: RealtimeChannel;
  refCount: number;
}

const entries = new Map<string, Entry>();

export function subscribeChannel(key: string, build: Builder): () => void {
  let entry = entries.get(key);
  if (!entry) {
    const channel = build(supabase.channel(key));
    channel.subscribe();
    entry = { channel, refCount: 0 };
    entries.set(key, entry);
  }
  entry.refCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const e = entries.get(key);
    if (!e) return;
    e.refCount -= 1;
    if (e.refCount <= 0) {
      entries.delete(key);
      try {
        supabase.removeChannel(e.channel);
      } catch {
        // ignore
      }
    }
  };
}

export function flushChannels(): void {
  for (const [, entry] of entries) {
    try {
      supabase.removeChannel(entry.channel);
    } catch {
      // ignore
    }
  }
  entries.clear();
}

if (typeof window !== "undefined") {
  // Dev inspector — does not ship anything sensitive.
  (window as unknown as { __channelRegistry?: () => string[] }).__channelRegistry = () =>
    Array.from(entries.entries()).map(([k, v]) => `${k} (refs=${v.refCount})`);
}
