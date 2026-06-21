import { useCallback, useState } from "react";

/**
 * A "saved view" is a named, opaque payload (filter state, layout, etc.)
 * persisted to localStorage. Pages that needed this (`/ops/pipeline`,
 * `/ops/notifications`, gallery, comm-saved-views, …) all rolled their own
 * `useState(load())` + `localStorage.setItem` boilerplate. This util collapses
 * that into a single hook.
 *
 * Storage shape: `SavedView<T>[]` under the given `localStorage` key. Each view
 * has a stable uuid, a user-given `name`, and a `snapshot: T` payload that the
 * caller controls.
 *
 * Errors during read/write are swallowed (Safari private mode, disabled
 * storage, JSON corruption) — the hook never throws.
 */
export type SavedView<T> = { id: string; name: string; snapshot: T };

function read<T>(key: string): SavedView<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedView<T>[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, views: SavedView<T>[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(views));
  } catch {
    /* ignore */
  }
}

export interface UseSavedViewsApi<T> {
  views: SavedView<T>[];
  /** Append a new view. Returns the created view's id, or `null` if the name was empty. */
  save: (name: string, snapshot: T) => string | null;
  /** Replace the snapshot of an existing view (e.g. "update to current"). */
  update: (id: string, snapshot: T) => void;
  /** Rename an existing view. No-op on empty name. */
  rename: (id: string, name: string) => void;
  /** Remove a view by id. */
  remove: (id: string) => void;
  /** Convenience: find a view by id. */
  byId: (id: string) => SavedView<T> | undefined;
}

/**
 * Hook returning a typed CRUD API over a localStorage-backed list of saved views.
 *
 * @example
 *   type PipelineFilters = { firmFilter: string; assigneeFilter: string };
 *   const sv = useSavedViews<PipelineFilters>("pipeline-filter-presets");
 *   // sv.views, sv.save("Q1 Acme", current), sv.remove(id), …
 */
export function useSavedViews<T>(storageKey: string): UseSavedViewsApi<T> {
  const [views, setViews] = useState<SavedView<T>[]>(() => read<T>(storageKey));

  const persist = useCallback(
    (next: SavedView<T>[]) => {
      setViews(next);
      write(storageKey, next);
    },
    [storageKey],
  );

  const save = useCallback(
    (name: string, snapshot: T): string | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const id = crypto.randomUUID();
      persist([...read<T>(storageKey), { id, name: trimmed, snapshot }]);
      return id;
    },
    [storageKey, persist],
  );

  const update = useCallback(
    (id: string, snapshot: T) =>
      persist(read<T>(storageKey).map((v) => (v.id === id ? { ...v, snapshot } : v))),
    [storageKey, persist],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      persist(read<T>(storageKey).map((v) => (v.id === id ? { ...v, name: trimmed } : v)));
    },
    [storageKey, persist],
  );

  const remove = useCallback(
    (id: string) => persist(read<T>(storageKey).filter((v) => v.id !== id)),
    [storageKey, persist],
  );

  const byId = useCallback((id: string) => views.find((v) => v.id === id), [views]);

  return { views, save, update, rename, remove, byId };
}
