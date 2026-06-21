import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { InboxKind } from "@/lib/ops/communication.queries";

export interface SelectionKey {
  kind: InboxKind;
  id: string;
}

interface SelectionState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  selected: Map<string, SelectionKey>; // key = `${kind}:${id}`
  toggle: (key: SelectionKey) => void;
  selectMany: (keys: SelectionKey[]) => void;
  clear: () => void;
  isSelected: (key: SelectionKey) => boolean;
  count: number;
}

const Ctx = createContext<SelectionState | null>(null);

const k = (s: SelectionKey) => `${s.kind}:${s.id}`;

export function InboxSelectionProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelectionKey>>(new Map());

  const toggle = useCallback((key: SelectionKey) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k(key))) next.delete(k(key));
      else next.set(k(key), key);
      return next;
    });
  }, []);

  const selectMany = useCallback((keys: SelectionKey[]) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const key of keys) next.set(k(key), key);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Map()), []);

  const isSelected = useCallback((key: SelectionKey) => selected.has(k(key)), [selected]);

  const value = useMemo<SelectionState>(
    () => ({
      enabled,
      setEnabled: (v) => {
        setEnabled(v);
        if (!v) setSelected(new Map());
      },
      selected,
      toggle,
      selectMany,
      clear,
      isSelected,
      count: selected.size,
    }),
    [enabled, selected, toggle, selectMany, clear, isSelected],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInboxSelection(): SelectionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInboxSelection must be used inside InboxSelectionProvider");
  return v;
}
