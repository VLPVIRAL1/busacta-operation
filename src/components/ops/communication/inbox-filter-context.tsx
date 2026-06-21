import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { InboxKind, InboxScope } from "@/lib/ops/communication.queries";

const TYPES_LS_KEY = "comm-inbox:types";
const SCOPE_LS_KEY = "comm-inbox:scope";

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export type InboxView = "active" | "archived";

/** Pipeline-stage → head bucket. Mirrors STAGE_TO_MAJOR in ops/pipeline.tsx. */
export const STAGE_HEAD_MAP: Record<string, string> = {
  handover_received: "with_bat",
  in_prep: "with_bat",
  internal_qc: "with_bat",
  waiting_cpa: "with_client",
  ready_for_delivery: "with_client",
  final_signoff: "completed",
};
export const STAGE_HEADS: { key: string; label: string }[] = [
  { key: "with_bat", label: "With BAT" },
  { key: "with_client", label: "With Client" },
  { key: "completed", label: "Completed" },
];
export function stageHeadOf(stage: string | null | undefined): string | null {
  if (!stage) return null;
  return STAGE_HEAD_MAP[stage] ?? null;
}

/** Combined people filter: kind=assignee|reviewer + user id. Empty array means all. */
export type PeopleFilter = { kind: "assignee" | "reviewer"; id: string };

interface InboxFilterState {
  search: string;
  setSearch: (v: string) => void;
  types: InboxKind[];
  setTypes: (v: InboxKind[]) => void;
  firmIds: string[];
  setFirmIds: (v: string[]) => void;
  /** Stage-head keys (with_bat / with_client / completed). Empty array means all. */
  stages: string[];
  setStages: (v: string[]) => void;
  people: PeopleFilter[];
  setPeople: (v: PeopleFilter[]) => void;
  view: InboxView;
  setView: (v: InboxView) => void;
  scope: InboxScope;
  setScope: (v: InboxScope) => void;
  isDirty: boolean;
  clearAll: () => void;
}

const Ctx = createContext<InboxFilterState | null>(null);

const DEFAULT_TYPES: InboxKind[] = ["dm", "group", "task"];

export function InboxFilterProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<InboxKind[]>(() =>
    typeof window === "undefined"
      ? DEFAULT_TYPES
      : loadJSON<InboxKind[]>(TYPES_LS_KEY, DEFAULT_TYPES),
  );
  useEffect(() => {
    saveJSON(TYPES_LS_KEY, types);
  }, [types]);
  const [firmIds, setFirmIds] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [people, setPeople] = useState<PeopleFilter[]>([]);
  const [view, setView] = useState<InboxView>("active");
  // Default to "mine" so a fresh session lands on My Chats.
  const [scope, setScopeState] = useState<InboxScope>(() =>
    typeof window === "undefined" ? "mine" : loadJSON<InboxScope>(SCOPE_LS_KEY, "mine"),
  );
  const setScope = (v: InboxScope) => {
    setScopeState(v);
    saveJSON(SCOPE_LS_KEY, v);
  };

  const isDirty =
    search.trim() !== "" ||
    firmIds.length > 0 ||
    stages.length > 0 ||
    people.length > 0 ||
    types.length !== DEFAULT_TYPES.length;

  const clearAll = () => {
    setSearch("");
    setFirmIds([]);
    setStages([]);
    setPeople([]);
    setTypes(DEFAULT_TYPES);
  };

  const value = useMemo<InboxFilterState>(
    () => ({
      search,
      setSearch,
      types,
      setTypes,
      firmIds,
      setFirmIds,
      stages,
      setStages,
      people,
      setPeople,
      view,
      setView,
      scope,
      setScope,
      isDirty,
      clearAll,
    }),
    [search, types, firmIds, stages, people, view, scope, isDirty],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInboxFilters(): InboxFilterState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInboxFilters must be used inside InboxFilterProvider");
  return v;
}
