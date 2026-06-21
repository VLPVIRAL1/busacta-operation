import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import type { Json } from "@/integrations/supabase/types";

const lsKey = (scope: string) => `ui-pref:${scope}`;

function readLocal<T>(scope: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(lsKey(scope));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(scope: string, value: T) {
  try {
    window.localStorage.setItem(lsKey(scope), JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * Per-user UI preference. Seeded from localStorage for instant render,
 * then reconciled with the `user_ui_prefs` row for the signed-in user.
 * setValue updates state + localStorage immediately and debounces an
 * upsert to the backend.
 */
export function useUserPref<T>(
  scope: string,
  fallback: T,
): {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  ready: boolean;
} {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [value, setValueState] = useState<T>(() => readLocal(scope, fallback));
  const [ready, setReady] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Tracks the latest userId without triggering re-renders — used in the
  // unmount flush so we always see the current user, not a stale closure.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Set to true when the user interacts (calls setValue) in this session.
  // Prevents the async reconciliation from silently overwriting an interactive
  // click that arrived while the DB fetch was still in-flight.
  const userInteracted = useRef(false);

  // Reconcile from backend on user change.
  useEffect(() => {
    // Reset the interaction guard whenever the user identity changes so a
    // freshly signed-in user always gets their stored preference applied.
    userInteracted.current = false;

    let cancelled = false;
    if (!userId) {
      setReady(true);
      return;
    }
    setReady(false);
    (async () => {
      try {
        const { data } = await supabase
          .from("user_ui_prefs")
          .select("value")
          .eq("user_id", userId)
          .eq("scope", scope)
          .maybeSingle();
        if (cancelled) return;
        // Only apply the DB value if the user hasn't made an interactive choice
        // in this session — avoids overwriting a click that landed while the
        // async fetch was still in-flight (Bug B).
        if (data?.value !== undefined && data.value !== null && !userInteracted.current) {
          setValueState(data.value as T);
          writeLocal(scope, data.value);
        }
      } catch {
        /* ignore — fall back to local seed */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, scope]);

  // Debounced upsert.
  const timerRef = useRef<number | null>(null);
  const flush = useCallback(
    (next: T) => {
      if (!userId) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void supabase
          .from("user_ui_prefs")
          .upsert(
            { user_id: userId, scope, value: next as unknown as Json },
            { onConflict: "user_id,scope" },
          )
          .then(({ error }) => {
            if (error) toast.error("Could not save UI preference");
          });
      }, 400);
    },
    [userId, scope],
  );

  // On unmount: flush any pending upsert immediately so navigating away within
  // the 400 ms debounce window doesn't silently discard the preference (Bug A).
  // Uses refs so the cleanup always sees the latest values without needing deps.
  useEffect(
    () => () => {
      if (!timerRef.current) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      const uid = userIdRef.current;
      if (uid) {
        void supabase
          .from("user_ui_prefs")
          .upsert(
            { user_id: uid, scope, value: valueRef.current as unknown as Json },
            { onConflict: "user_id,scope" },
          );
      }
    },
    // scope is constant per hook call — intentionally not in deps so the
    // cleanup closure is stable and always reads the latest refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      userInteracted.current = true;
      setValueState((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeLocal(scope, resolved);
        flush(resolved);
        return resolved;
      });
    },
    [scope, flush],
  );

  return { value, setValue, ready };
}
