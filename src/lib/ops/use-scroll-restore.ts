/**
 * Persist a scroll container's scrollTop in sessionStorage so it survives
 * route navigation and full page refresh. Keyed per-page so each grid
 * restores independently.
 *
 * Usage:
 *   const scrollRef = useRef<HTMLDivElement>(null);
 *   useScrollRestore(scrollRef, "ops:time-logs", { ready: rows.length > 0, key: filterSignature });
 *
 * - `ready` gates the restore until the first batch of rows has mounted
 *   (otherwise scrollHeight is too small to seek to the saved offset).
 * - `key` invalidates the stored offset when filters change (so changing
 *   filters scrolls to the top instead of restoring a now-meaningless offset).
 */
import { useEffect, useLayoutEffect, useRef } from "react";

interface StoredScroll {
  top: number;
  key: string;
}

export function useScrollRestore(
  ref: React.RefObject<HTMLElement>,
  storageKey: string,
  opts: { ready: boolean; key: string },
) {
  const restoredRef = useRef(false);
  const lastKeyRef = useRef(opts.key);

  // Restore on first render where rows are ready.
  useLayoutEffect(() => {
    if (!opts.ready || restoredRef.current) return;
    const el = ref.current;
    if (!el) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        restoredRef.current = true;
        return;
      }
      const parsed: StoredScroll = JSON.parse(raw);
      if (parsed.key === opts.key && Number.isFinite(parsed.top)) {
        el.scrollTop = parsed.top;
      }
      restoredRef.current = true;
    } catch {
      restoredRef.current = true;
    }
  }, [ref, storageKey, opts.ready, opts.key]);

  // Reset on filter-key change.
  useEffect(() => {
    if (lastKeyRef.current !== opts.key) {
      lastKeyRef.current = opts.key;
      restoredRef.current = false;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      const el = ref.current;
      if (el) el.scrollTop = 0;
    }
  }, [opts.key, ref, storageKey]);

  // Throttled save on scroll + save on unmount.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const save = () => {
      raf = 0;
      try {
        const payload: StoredScroll = { top: el.scrollTop, key: opts.key };
        sessionStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        /* ignore quota / private mode */
      }
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(save);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", save);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", save);
      if (raf) window.cancelAnimationFrame(raf);
      // Save on unmount so the next mount can restore.
      save();
    };
  }, [ref, storageKey, opts.key]);
}
