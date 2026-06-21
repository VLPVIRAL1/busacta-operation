import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { subscribeChannel } from "@/lib/realtime/channel-registry";

/**
 * Subscribe to a realtime channel for the lifetime of the component.
 *
 * The registry refcounts subscribers, so multiple components asking for the
 * same `key` share one underlying Supabase channel. The `build` callback runs
 * exactly once per key (the first time the channel is created) and must
 * return the channel after attaching all `.on(...)` handlers.
 *
 * Pass `null`/`undefined` as the key to disable (e.g. while ids load).
 */
export function useRealtimeChannel(
  key: string | null | undefined,
  build: (channel: RealtimeChannel) => RealtimeChannel,
): void {
  useEffect(() => {
    if (!key) return;
    const unsubscribe = subscribeChannel(key, build);
    return unsubscribe;
    // We intentionally only depend on `key`. The `build` callback is captured
    // once per key by the registry; passing it in deps would force needless
    // teardown/recreate on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
