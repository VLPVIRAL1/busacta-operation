import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { isTypingTarget } from "./is-typing-target";

export type RowAction<T = unknown> = (row: T, index: number) => void;

export type UseRovingListOptions<T> = {
  rows: readonly T[];
  /** Stable id getter — used for keys and selection tracking. */
  getId: (row: T, index: number) => string;
  onOpen?: RowAction<T>;
  onEdit?: RowAction<T>;
  onComplete?: RowAction<T>;
  onPin?: RowAction<T>;
  onMarkRead?: RowAction<T>;
  onSnooze?: RowAction<T>;
  onDelete?: RowAction<T>;
  /** Number of rows to jump on PageUp/PageDown. */
  pageSize?: number;
  /** Disable list shortcuts (e.g. while editing a cell inline). */
  enabled?: boolean;
};

type RowProps = {
  ref: (el: HTMLElement | null) => void;
  tabIndex: number;
  role: "row";
  "data-active": boolean;
  "aria-selected": boolean;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
};

/**
 * ARIA roving-tabindex list navigation with single-letter row actions.
 * Use one tabstop per list; arrows move within.
 */
export function useRovingListNavigation<T>({
  rows,
  getId,
  onOpen,
  onEdit,
  onComplete,
  onPin,
  onMarkRead,
  onSnooze,
  onDelete,
  pageSize = 10,
  enabled = true,
}: UseRovingListOptions<T>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const rowRefs = useRef<(HTMLElement | null)[]>([]);

  // Clamp activeIndex when rows shrink.
  useEffect(() => {
    if (activeIndex >= rows.length) setActiveIndex(Math.max(0, rows.length - 1));
  }, [rows.length, activeIndex]);

  const focusRow = useCallback((i: number) => {
    const el = rowRefs.current[i];
    if (el) {
      el.focus({ preventScroll: false });
      el.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const move = useCallback(
    (delta: number) => {
      if (!rows.length) return;
      const next = Math.max(0, Math.min(rows.length - 1, activeIndex + delta));
      setActiveIndex(next);
      requestAnimationFrame(() => focusRow(next));
    },
    [rows.length, activeIndex, focusRow],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const getRowProps = useCallback(
    (index: number): RowProps => {
      const row = rows[index];
      const id = row ? getId(row, index) : String(index);
      const isActive = index === activeIndex;
      return {
        ref: (el) => {
          rowRefs.current[index] = el;
        },
        tabIndex: isActive ? 0 : -1,
        role: "row",
        "data-active": isActive,
        "aria-selected": selectedIds.has(id),
        onFocus: () => setActiveIndex(index),
        onKeyDown: (e) => {
          if (!enabled) return;
          if (isTypingTarget(e.target)) return;
          const row = rows[index];
          if (!row) return;
          const key = e.key;
          const ctrl = e.ctrlKey || e.metaKey;

          if (key === "ArrowDown" || key === "j") return (e.preventDefault(), move(1));
          if (key === "ArrowUp" || key === "k") return (e.preventDefault(), move(-1));
          if (key === "Home")
            return (
              e.preventDefault(),
              (setActiveIndex(0), requestAnimationFrame(() => focusRow(0)))
            );
          if (key === "End") {
            e.preventDefault();
            const last = rows.length - 1;
            setActiveIndex(last);
            requestAnimationFrame(() => focusRow(last));
            return;
          }
          if (key === "PageDown") return (e.preventDefault(), move(pageSize));
          if (key === "PageUp") return (e.preventDefault(), move(-pageSize));
          if (key === "Enter") return (e.preventDefault(), onOpen?.(row, index));
          if (key === " ") return (e.preventDefault(), toggleSelect(id));
          if (ctrl && (key === "a" || key === "A")) {
            e.preventDefault();
            setSelectedIds(new Set(rows.map((r, i) => getId(r, i))));
            return;
          }
          // Single-letter actions
          if (!ctrl && !e.altKey) {
            switch (key.toLowerCase()) {
              case "e":
                if (onEdit) {
                  e.preventDefault();
                  onEdit(row, index);
                }
                return;
              case "c":
                if (onComplete) {
                  e.preventDefault();
                  onComplete(row, index);
                }
                return;
              case "p":
                if (onPin) {
                  e.preventDefault();
                  onPin(row, index);
                }
                return;
              case "m":
                if (onMarkRead) {
                  e.preventDefault();
                  onMarkRead(row, index);
                }
                return;
              case "s":
                if (onSnooze) {
                  e.preventDefault();
                  onSnooze(row, index);
                }
                return;
              case "x":
                e.preventDefault();
                toggleSelect(id);
                return;
            }
            if (key === "Delete" || key === "#") {
              if (onDelete) {
                e.preventDefault();
                onDelete(row, index);
              }
              return;
            }
          }
        },
      };
    },
    [
      rows,
      activeIndex,
      selectedIds,
      enabled,
      getId,
      move,
      focusRow,
      pageSize,
      onOpen,
      onEdit,
      onComplete,
      onPin,
      onMarkRead,
      onSnooze,
      onDelete,
      toggleSelect,
    ],
  );

  return {
    activeIndex,
    setActiveIndex,
    selectedIds,
    toggleSelect,
    clearSelection,
    getRowProps,
    focusRow,
  };
}
