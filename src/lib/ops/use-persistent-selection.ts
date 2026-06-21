import { useEffect, useState } from "react";

/**
 * Selected-id state that persists to localStorage under `key`. Replaces the
 * `useState(() => localStorage.getItem(key))` + `useEffect(setItem)` boilerplate
 * duplicated across the Ops/Clients split-pane shells (firms, projects,
 * productivity, todos, workspace, clients).
 *
 * SSR-safe (reads localStorage lazily on the client) and swallows storage
 * errors (private mode / disabled storage).
 */
export function usePersistentSelection(key: string): [string | null, (id: string | null) => void] {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (selectedId) window.localStorage.setItem(key, selectedId);
    } catch {
      /* ignore */
    }
  }, [key, selectedId]);

  return [selectedId, setSelectedId];
}
