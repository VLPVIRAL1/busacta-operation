import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Search,
  SlidersHorizontal,
  GripVertical,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  Filter as FilterIcon,
  X,
  ArrowUp,
  ArrowDown,
  Pencil,
  Download,
  RotateCcw,
  Maximize2,
  Calendar as CalendarIcon,
  Sun,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FirmCode, ProjectCode } from "@/components/shared/entity-code";
import { StreamBadge } from "@/components/shared/stream-badge";
import { Calendar } from "@/components/ui/calendar";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { UserAvatar } from "@/components/shared/user-avatar";
import { CreateWorkItemModal } from "@/components/ops/create-work-item-modal";
import { MultiPersonPicker } from "@/components/shared/multi-person-picker";
import { TodosViewSwitcher } from "@/components/ops/todos-view-switcher";
import { TodosBulkBar } from "@/components/ops/todos-bulk-bar";
import {
  PeopleFilterPopover,
  PeopleFilterChips,
  emptyPeopleFilter,
  isPeopleFilterActive,
  type PeopleFilterValue,
} from "@/components/ops/todos-people-filter";
import { rowsToCsv, downloadCsv } from "@/components/ops/todos-export-csv";
import { MyDayToggle } from "@/components/ops/my-day-toggle";
import { SubtaskList } from "@/components/ops/subtask-list";
import { TaskTimerButton } from "@/components/ops/task-timer-button";
import { TodosSplitShell } from "@/components/ops/todos/todos-split-shell";
import { useUserPref } from "@/lib/ops/user-prefs";
import {
  todosQuery,
  projectPipelineStagesAllQuery,
  updateTaskField,
  replaceTaskPeople,
  firmClientsQuery,
  myDayActiveQuery,
  type TodoRow,
  type TaskViewConfig,
  type PipelineStageRow,
  type FirmClientRow,
} from "@/lib/queries/ops.queries";
import { supabase } from "@/integrations/supabase/client";
import { TASK_PRIORITY_OPTIONS, labelFor } from "@/lib/shared/domain";
import {
  PriorityIcon,
  ComplexityIcon,
  PriorityBadge,
  ComplexityBadge,
} from "@/lib/ui/task-option-icons";
import {
  stageChip,
  priorityChip,
  complexityChip,
  periodChip,
  groupHeadingTone,
  STAGE_STATE_LABEL,
  COMPLEXITY_LABEL,
} from "@/components/ops/todos-color-map";

type ColKey =
  | "select"
  | "task_id"
  | "title"
  | "firm"
  | "project"
  | "client"
  | "tax_year"
  | "period"
  | "complexity"
  | "priority"
  | "due_date"
  | "start_date"
  | "stage"
  | "stage_head"
  | "assignees"
  | "reviewers"
  | "edit";

interface ColDef {
  key: ColKey;
  label: string;
  defaultWidth: number;
  groupable?: boolean;
  filterKind?: "text" | "select" | "person" | "number" | "date" | "stage";
}

const COLUMNS: ColDef[] = [
  { key: "select", label: "", defaultWidth: 32 },
  { key: "task_id", label: "Task ID", defaultWidth: 92, filterKind: "text" },
  { key: "title", label: "Task", defaultWidth: 280, filterKind: "text" },
  { key: "firm", label: "Firm", defaultWidth: 88, groupable: true, filterKind: "text" },
  { key: "project", label: "Project", defaultWidth: 96, groupable: true, filterKind: "text" },
  { key: "client", label: "Client / Entity", defaultWidth: 180, filterKind: "text" },
  { key: "tax_year", label: "Tax Year", defaultWidth: 80, groupable: true, filterKind: "number" },
  { key: "period", label: "Period", defaultWidth: 96, groupable: true, filterKind: "select" },
  {
    key: "complexity",
    label: "Difficulty",
    defaultWidth: 104,
    groupable: true,
    filterKind: "select",
  },
  { key: "priority", label: "Urgency", defaultWidth: 96, groupable: true, filterKind: "select" },
  { key: "due_date", label: "Due", defaultWidth: 140, filterKind: "date" },
  { key: "start_date", label: "Start", defaultWidth: 140, filterKind: "date" },
  { key: "stage", label: "Stage", defaultWidth: 140, groupable: true, filterKind: "stage" },
  {
    key: "stage_head",
    label: "Stage Head",
    defaultWidth: 116,
    groupable: true,
    filterKind: "select",
  },
  { key: "assignees", label: "Assignees", defaultWidth: 116, filterKind: "person" },
  { key: "reviewers", label: "Reviewers", defaultWidth: 116, filterKind: "person" },
  { key: "edit", label: "", defaultWidth: 64 },
];

type ColumnState = { key: ColKey; visible: boolean; width: number; order: number };

function defaultColumns(): ColumnState[] {
  // `edit` column holds the row's quick Edit + My Day pin actions; `task_id` shows the auto display ID.
  return COLUMNS.map((c, i) => ({ key: c.key, visible: true, width: c.defaultWidth, order: i }));
}

type SortState = { key: ColKey; dir: "asc" | "desc" }[];
type FilterState = Record<string, unknown> & {
  assignees?: PeopleFilterValue;
  reviewers?: PeopleFilterValue;
};
type Scope = "all" | "mine" | "unassigned";

// Layout + display mode are persisted per user via useUserPref (see below).

// ─────────────── helpers ───────────────
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (s: string) => (s ? new Date(s).toISOString() : null);
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

// ─────────────── main component ───────────────
export type TodosDisplayMode = "table" | "compact";

export function TodosTable({ mode: modeProp }: { mode?: TodosDisplayMode } = {}) {
  const { value: storedMode, setValue: setStoredMode } = useUserPref<TodosDisplayMode>(
    "ops.todos.displayMode",
    "compact",
  );
  const mode: TodosDisplayMode = modeProp ?? storedMode;
  const setMode = useCallback(
    (m: TodosDisplayMode) => {
      if (modeProp) return;
      setStoredMode(m);
    },
    [modeProp, setStoredMode],
  );

  // Render mode-specific shells as separate components so each owns its own
  // hook list. Mounting/unmounting between modes avoids React error #310
  // (rendered more hooks than during the previous render).
  if (mode === "compact") {
    return <CompactModeShell mode={mode} setMode={setMode} />;
  }
  return <TableModeShell mode={mode} setMode={setMode} />;
}

function TableModeShell({
  mode,
  setMode,
}: {
  mode: TodosDisplayMode;
  setMode: (m: TodosDisplayMode) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // `--todos-viewport-width` is consumed by the expanded-subtask panel
    // (`width: var(--todos-viewport-width)`), which lives *inside* this scroll
    // container. Writing the var straight from the ResizeObserver callback
    // creates a feedback loop: the panel relayouts → scrollbar toggles →
    // clientWidth changes → observer fires again. When the relayout cascades
    // into every anchored Radix popper's own ResizeObserver it overflows
    // React's synchronous update depth and crashes the page.
    //
    // Break the loop two ways: (1) only write when the value actually changes,
    // and (2) defer the write to the next animation frame so it never runs
    // synchronously inside the observer callback.
    let raf = 0;
    let last = -1;
    const apply = () => {
      const w = el.clientWidth;
      if (w === last) return;
      last = w;
      el.style.setProperty("--todos-viewport-width", `${w}px`);
    };
    apply();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const { data: rows = [], isLoading } = useQuery(todosQuery(user?.id, role));
  const { data: allStages = [] } = useQuery(projectPipelineStagesAllQuery());

  // Profile lookup for people filter chips / CSV export
  const { data: people = [] } = useQuery({
    queryKey: ["people-picker", "internal"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "employee"]);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", ids);
      return data ?? [];
    },
    staleTime: 60_000,
  });
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of people) m.set(p.id, p.full_name || p.email || p.id.slice(0, 6));
    return m;
  }, [people]);
  const profileById = useMemo(() => {
    const m = new Map<
      string,
      { id: string; full_name: string | null; email: string | null; avatar_url: string | null }
    >();
    for (const p of people) m.set(p.id, p);
    return m;
  }, [people]);
  // Lazy firm-client map: not loaded eagerly; ClientEntityEdit fetches per firm.
  const firmClientsByFirm = useMemo(() => new Map<string, FirmClientRow[]>(), []);

  // View / column state ----------------------------------------------------
  const [currentViewId, setCurrentViewId] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnState[]>(defaultColumns());
  const [sort, setSort] = useState<SortState>([]);
  const [filters, setFilters] = useState<FilterState>({});
  const [groupBy, setGroupBy] = useState<ColKey | null>(null);
  const [scope, setScope] = useState<Scope>("mine");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [myDayOnly, setMyDayOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const toggleExpand = (id: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const { data: myDayRows = [] } = useQuery(myDayActiveQuery(user?.id));
  const myDaySet = useMemo(() => new Set(myDayRows.map((r) => r.task_id)), [myDayRows]);

  // Per-user layout (columns visibility/width/order + groupBy + defaultScope).
  const {
    value: storedLayout,
    setValue: setStoredLayout,
    ready: layoutReady,
  } = useUserPref<TaskViewConfig | null>("ops.todos.layout.default", null);

  // Apply the persisted layout EXACTLY ONCE, the first time it becomes ready.
  // After that the in-session state is the source of truth and is only ever
  // written out (below). Because a write can never re-trigger an apply, the two
  // effects cannot ping-pong — which was the cause of the "Maximum update depth"
  // loop on this page.
  const layoutAppliedRef = useRef(false);
  useEffect(() => {
    if (layoutAppliedRef.current || !layoutReady) return;
    layoutAppliedRef.current = true;
    if (!storedLayout) return;
    try {
      if (storedLayout.columns) {
        const next = defaultColumns();
        const map = new Map(storedLayout.columns.map((c) => [c.key, c]));
        const merged = next.map((c) => {
          const v = map.get(c.key);
          return v
            ? {
                ...c,
                visible: v.visible ?? true,
                width: v.width ?? c.width,
                order: v.order ?? c.order,
              }
            : c;
        });
        merged.sort((a, b) => a.order - b.order);
        setColumns(merged);
      }
      if (storedLayout.groupBy !== undefined)
        setGroupBy((storedLayout.groupBy as ColKey | null) ?? null);
      if (storedLayout.defaultScope) setScope(storedLayout.defaultScope);
    } catch {
      /* ignore */
    }
  }, [layoutReady, storedLayout]);

  const config: TaskViewConfig = useMemo(
    () => ({
      columns: columns.map(({ key, visible, width, order }) => ({ key, visible, width, order })),
      filters,
      sort,
      groupBy,
      defaultScope: scope,
    }),
    [columns, filters, sort, groupBy, scope],
  );

  // Persist the per-user default-view layout whenever it changes — but only
  // after the initial apply has run, so loading a saved layout never writes it
  // straight back in a loop. `useUserPref` debounces the backend upsert, and a
  // write here never re-applies, so no signature guard / cycle-breaking needed.
  useEffect(() => {
    if (currentViewId) return; // only persist when no named view is active
    if (!layoutReady || !layoutAppliedRef.current) return;
    setStoredLayout(config);
  }, [config, currentViewId, layoutReady, setStoredLayout]);

  const applyView = useCallback((id: string | null, cfg: TaskViewConfig) => {
    setCurrentViewId(id);
    setSelected(new Set());
    if (!id) {
      setColumns(defaultColumns());
      setSort([]);
      setFilters({});
      setGroupBy(null);
      setScope("mine");
      return;
    }
    if (cfg.columns) {
      const next = defaultColumns();
      const map = new Map(cfg.columns.map((c) => [c.key, c]));
      const merged = next.map((c) => {
        const v = map.get(c.key);
        return v
          ? {
              ...c,
              visible: v.visible ?? true,
              width: v.width ?? c.width,
              order: v.order ?? c.order,
            }
          : c;
      });
      merged.sort((a, b) => a.order - b.order);
      setColumns(merged);
    } else {
      setColumns(defaultColumns());
    }
    setSort((cfg.sort ?? []) as SortState);
    setFilters((cfg.filters ?? {}) as FilterState);
    setGroupBy((cfg.groupBy as ColKey | null) ?? null);
    setScope((cfg.defaultScope as Scope) ?? "mine");
  }, []);

  // Lookups -----------------------------------------------------------------
  const stagesByProject = useMemo(() => {
    const map = new Map<string, PipelineStageRow[]>();
    for (const s of allStages) {
      const arr = map.get(s.project_id) ?? [];
      arr.push(s);
      map.set(s.project_id, arr);
    }
    return map;
  }, [allStages]);

  // Filter + sort + group --------------------------------------------------
  const assigneesFilter = (filters.assignees ?? emptyPeopleFilter()) as PeopleFilterValue;
  const reviewersFilter = (filters.reviewers ?? emptyPeopleFilter()) as PeopleFilterValue;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows as TodoRow[]).filter((r) => {
      const firm = r.client_entities?.projects?.firms?.name ?? "";
      const firmCode =
        (r.client_entities?.projects?.firms as { firm_identifier?: string | null } | undefined)
          ?.firm_identifier ?? "";
      const project = r.client_entities?.projects?.name ?? "";
      const projectCode =
        (r.client_entities?.projects as { code?: string | null } | undefined)?.code ?? "";
      const client = r.client_entities?.name ?? r.direct_clients?.display_name ?? "";
      if (scope === "mine" && user) {
        const me =
          r.assignee_id === user.id || (r.task_assignees ?? []).some((p) => p.user_id === user.id);
        if (!me) return false;
      } else if (scope === "unassigned") {
        if (r.assignee_id || (r.task_assignees ?? []).some((p) => p.role === "assignee"))
          return false;
      }
      if (myDayOnly && !myDaySet.has(r.id)) return false;
      if (q) {
        const hay =
          `${r.title} ${firm} ${firmCode} ${project} ${projectCode} ${client}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // People filters
      const aIds = (r.task_assignees ?? [])
        .filter((p) => p.role === "assignee")
        .map((p) => p.user_id);
      const rIds = (r.task_assignees ?? [])
        .filter((p) => p.role === "reviewer")
        .map((p) => p.user_id);
      if (isPeopleFilterActive(assigneesFilter)) {
        const matchMe = assigneesFilter.me && user && aIds.includes(user.id);
        const matchNone = assigneesFilter.none && aIds.length === 0;
        const matchId = assigneesFilter.ids.some((id) => aIds.includes(id));
        if (!(matchMe || matchNone || matchId)) return false;
      }
      if (isPeopleFilterActive(reviewersFilter)) {
        const matchMe = reviewersFilter.me && user && rIds.includes(user.id);
        const matchNone = reviewersFilter.none && rIds.length === 0;
        const matchId = reviewersFilter.ids.some((id) => rIds.includes(id));
        if (!(matchMe || matchNone || matchId)) return false;
      }
      for (const [k, v] of Object.entries(filters)) {
        if (k === "assignees" || k === "reviewers") continue;
        const f = normalizeColumnFilter(v);
        if (!f) continue;
        let cell: string | number | null | undefined;
        switch (k) {
          case "task_id":
            cell = r.display_id;
            break;
          case "title":
            cell = r.title;
            break;
          case "firm":
            cell = firm;
            break;
          case "project":
            cell = project;
            break;
          case "client":
            cell = client;
            break;
          case "tax_year":
            cell = r.tax_year;
            break;
          case "period":
            cell = r.period;
            break;
          case "complexity":
            cell = r.complexity;
            break;
          case "priority":
            cell = r.priority;
            break;
          case "status":
            cell = r.status;
            break;
          case "stage":
            cell = r.pipeline_stage_id;
            break;
          case "stage_head":
            cell = r.project_pipeline_stages?.primary_state;
            break;
          case "due_date":
            cell = r.due_date;
            break;
          case "start_date":
            cell = r.start_date;
            break;
          default:
            continue;
        }
        if (!matchesColumnFilter(cell, f)) return false;
      }
      return true;
    });
  }, [rows, search, filters, scope, user, assigneesFilter, reviewersFilter, myDayOnly, myDaySet]);

  const sorted = useMemo(() => {
    if (sort.length === 0) return filtered;
    const acc = (r: TodoRow, k: ColKey): string | number => {
      switch (k) {
        case "task_id":
          return r.display_id ?? "";
        case "title":
          return r.title;
        case "firm":
          return r.client_entities?.projects?.firms?.name ?? "";
        case "project":
          return r.client_entities?.projects?.name ?? "";
        case "client":
          return r.client_entities?.name ?? "";
        case "tax_year":
          return r.tax_year ?? 0;
        case "complexity":
          return r.complexity ?? "";
        case "priority":
          return r.priority ?? "";
        case "due_date":
          return r.due_date ?? "";
        case "start_date":
          return r.start_date ?? "";
        case "stage":
          return r.project_pipeline_stages?.label ?? "";
        case "stage_head":
          return r.project_pipeline_stages?.primary_state ?? "";
        case "period":
          return r.period ?? "";
        default:
          return "";
      }
    };
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      for (const s of sort) {
        const va = acc(a, s.key);
        const vb = acc(b, s.key);
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
    return sorted;
  }, [filtered, sort]);

  const grouped = useMemo(() => {
    if (!groupBy) return [{ key: "__all__", label: "", items: sorted }];
    const groupVal = (r: TodoRow): string => {
      switch (groupBy) {
        case "firm":
          return r.client_entities?.projects?.firms?.name ?? "—";
        case "project":
          return r.client_entities?.projects?.name ?? "—";
        case "tax_year":
          return String(r.tax_year ?? "—");
        case "complexity":
          return COMPLEXITY_LABEL[r.complexity] ?? "—";
        case "priority":
          return r.priority ?? "—";
        case "stage":
          return r.project_pipeline_stages?.label ?? "—";
        case "stage_head":
          return STAGE_STATE_LABEL[r.project_pipeline_stages?.primary_state ?? ""] ?? "—";
        case "period":
          return r.period ?? "—";
        default:
          return "—";
      }
    };
    const map = new Map<string, TodoRow[]>();
    for (const r of sorted) {
      const k = groupVal(r);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ key: label, label, items }));
  }, [sorted, groupBy]);

  const visibleCols = useMemo(
    () => [...columns].sort((a, b) => a.order - b.order).filter((c) => c.visible),
    [columns],
  );

  // Distinct values per column (for Excel-style filter checklists)
  const distinctByCol = useMemo(() => {
    const acc = (r: TodoRow, k: ColKey): string => {
      switch (k) {
        case "task_id":
          return r.display_id ?? "";
        case "title":
          return r.title;
        case "firm":
          return r.client_entities?.projects?.firms?.name ?? "";
        case "project":
          return r.client_entities?.projects?.name ?? "";
        case "client":
          return r.client_entities?.name ?? "";
        case "tax_year":
          return String(r.tax_year ?? "");
        case "period":
          return r.period ?? "";
        case "complexity":
          return r.complexity ?? "";
        case "priority":
          return r.priority ?? "";
        case "stage":
          return r.pipeline_stage_id ?? "";
        case "stage_head":
          return r.project_pipeline_stages?.primary_state ?? "";
        default:
          return "";
      }
    };
    const m = new Map<ColKey, Map<string, string>>(); // key -> Map<rawValue, displayLabel>
    const stageLabel = (id: string) => allStages.find((s) => s.id === id)?.label ?? id;
    for (const r of rows as TodoRow[]) {
      for (const c of COLUMNS) {
        if (!c.filterKind || c.filterKind === "person" || c.filterKind === "date") continue;
        const raw = acc(r, c.key);
        if (!raw) continue;
        const map = m.get(c.key) ?? new Map<string, string>();
        let label = raw;
        if (c.key === "complexity") label = COMPLEXITY_LABEL[raw] ?? raw;
        else if (c.key === "stage_head") label = STAGE_STATE_LABEL[raw] ?? raw;
        else if (c.key === "stage") label = stageLabel(raw);
        map.set(raw, label);
        m.set(c.key, map);
      }
    }
    return m;
  }, [rows, allStages]);

  // Selection helpers
  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected],
  );
  const allFilteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;
  function toggleSelectAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allFilteredIds));
  }
  function toggleSelectOne(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // Mutations ---------------------------------------------------------------
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["todos"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const mField = useMutation({
    mutationFn: async (v: { id: string; patch: Record<string, unknown> }) =>
      updateTaskField(v.id, v.patch),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const mPeople = useMutation({
    mutationFn: replaceTaskPeople,
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleSort(k: ColKey, additive = false) {
    setSort((prev) => {
      const found = prev.find((s) => s.key === k);
      if (!additive) {
        if (!found) return [{ key: k, dir: "asc" }];
        if (found.dir === "asc") return [{ key: k, dir: "desc" }];
        return [];
      }
      if (!found) return [...prev, { key: k, dir: "asc" }];
      if (found.dir === "asc") return prev.map((s) => (s.key === k ? { ...s, dir: "desc" } : s));
      return prev.filter((s) => s.key !== k);
    });
  }
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (k: string) => {
    setCollapsed((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  // CSV export
  function handleExport() {
    const visibleForCsv = visibleCols
      .filter((c) => c.key !== "select" && c.key !== "edit")
      .map((c) => ({ key: c.key, label: COLUMNS.find((d) => d.key === c.key)!.label }));
    const csv = rowsToCsv(grouped, visibleForCsv, nameById, !!groupBy);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(`todos-${stamp}.csv`, csv);
  }

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    if (active.id === "select" || active.id === "edit") return;
    if (over.id === "select" || over.id === "edit") return;
    setColumns((prev) => {
      const ordered = [...prev].sort((a, b) => a.order - b.order);
      const oldIdx = ordered.findIndex((c) => c.key === active.id);
      const newIdx = ordered.findIndex((c) => c.key === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const next = arrayMove(ordered, oldIdx, newIdx);
      return next.map((c, i) => ({ ...c, order: i }));
    });
  }

  // Render ------------------------------------------------------------------
  const totalWidth = visibleCols.reduce((s, c) => s + c.width, 0);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden gap-3 p-3">
        {/* Toolbar */}
        <div className="glass border border-border-subtle rounded-lg p-3 flex flex-wrap items-center gap-2">
          <TodosViewSwitcher
            currentViewId={currentViewId}
            currentConfig={config}
            onApply={applyView}
          />
          <div
            className="inline-flex rounded-md border bg-background p-0.5 ml-1"
            role="tablist"
            aria-label="View mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "table"}
              onClick={() => setMode("table")}
              className={cn(
                "px-2.5 h-7 text-xs rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                mode === "table"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Table view"
              aria-label="Switch to Table view"
            >
              Table
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={false}
              onClick={() => setMode("compact")}
              className={cn(
                "px-2.5 h-7 text-xs rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                "text-muted-foreground hover:text-foreground",
              )}
              title="Split view (list + detail)"
              aria-label="Switch to Split (list and detail) view"
            >
              Split
            </button>
          </div>
          <div className="h-6 w-px bg-border mx-1" />
          <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <SelectTrigger className="h-8 w-[140px] sm:w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Assigned to me</SelectItem>
              <SelectItem value="all">All visible</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant={myDayOnly ? "default" : "outline"}
            className={cn(
              "h-8 text-xs gap-1.5",
              myDayOnly && "bg-amber-500 hover:bg-amber-500/90 text-white",
            )}
            onClick={() => setMyDayOnly((v) => !v)}
            title={
              myDayOnly
                ? "Showing only My Day tasks — click to clear"
                : "Show only tasks pinned to My Day"
            }
            aria-pressed={myDayOnly}
          >
            <Sun className={cn("h-3.5 w-3.5", myDayOnly && "fill-amber-200")} />
            My Day
            {myDayOnly && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
                {myDaySet.size}
              </Badge>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={expandAll ? "default" : "outline"}
            className="h-8 text-xs gap-1.5"
            onClick={() => setExpandAll((v) => !v)}
            title={expandAll ? "Collapse all subtasks" : "Show subtasks for every task"}
            aria-pressed={expandAll}
          >
            {expandAll ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Subtasks
          </Button>
          <div className="relative flex-1 sm:flex-none">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, firm, project, client…"
              className="h-8 text-xs pl-7 w-full sm:w-[260px]"
            />
          </div>
          <Select
            value={groupBy ?? "none"}
            onValueChange={(v) => setGroupBy(v === "none" ? null : (v as ColKey))}
          >
            <SelectTrigger className="h-8 w-[140px] sm:w-[170px] text-xs">
              <SelectValue placeholder="Group by…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              {COLUMNS.filter((c) => c.groupable).map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  Group by {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ColumnsConfigButton columns={columns} setColumns={setColumns} />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={handleExport}
            title="Export CSV"
            aria-label="Export CSV"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          {(Object.keys(filters).length > 0 || sort.length > 0) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs gap-1"
              onClick={() => {
                setFilters({});
                setSort([]);
              }}
            >
              <X className="h-3.5 w-3.5" /> Clear filters/sort
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} task{filtered.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* People filter chip rail */}
        {(isPeopleFilterActive(assigneesFilter) || isPeopleFilterActive(reviewersFilter)) && (
          <div className="flex flex-wrap gap-3 px-1">
            <PeopleFilterChips
              label="Assignees"
              value={assigneesFilter}
              onChange={(v) => setFilters((p) => ({ ...p, assignees: v }))}
              meLabel="Me"
              noneLabel="Unassigned"
              nameById={nameById}
            />
            <PeopleFilterChips
              label="Reviewers"
              value={reviewersFilter}
              onChange={(v) => setFilters((p) => ({ ...p, reviewers: v }))}
              meLabel="Me"
              noneLabel="No reviewer"
              nameById={nameById}
            />
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <TodosBulkBar
            selected={selectedRows}
            stagesByProject={stagesByProject}
            onClear={() => setSelected(new Set())}
            onApplied={() => {
              invalidate();
              setSelected(new Set());
            }}
          />
        )}

        {/* Table */}
        <div
          ref={scrollRef}
          className="rounded-lg border border-border-subtle glass overflow-auto flex-1 min-h-0"
        >
          <div style={{ minWidth: totalWidth }}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleCols.map((c) => c.key)}
                strategy={horizontalListSortingStrategy}
              >
                <div
                  className="grid sticky top-0 z-10 bg-card/95 backdrop-blur border-b text-xs font-medium"
                  style={{
                    gridTemplateColumns: visibleCols.map((c) => `${c.width}px`).join(" "),
                  }}
                >
                  {visibleCols.map((c) => (
                    <HeaderCell
                      key={c.key}
                      col={c}
                      sort={sort}
                      onToggleSort={toggleSort}
                      onSortDir={(dir) => setSort([{ key: c.key, dir }])}
                      filterValue={filters[c.key]}
                      onFilterChange={(v) => setFilters((p) => ({ ...p, [c.key]: v }))}
                      onClearFilter={() =>
                        setFilters((p) => {
                          const n = { ...p };
                          delete n[c.key];
                          return n;
                        })
                      }
                      distinctValues={distinctByCol.get(c.key)}
                      stages={allStages}
                      assigneesFilter={assigneesFilter}
                      reviewersFilter={reviewersFilter}
                      onAssigneesFilter={(v) => setFilters((p) => ({ ...p, assignees: v }))}
                      onReviewersFilter={(v) => setFilters((p) => ({ ...p, reviewers: v }))}
                      onResize={(w) =>
                        setColumns((prev) =>
                          prev.map((pc) => (pc.key === c.key ? { ...pc, width: w } : pc)),
                        )
                      }
                      onHide={() =>
                        setColumns((prev) =>
                          prev.map((pc) => (pc.key === c.key ? { ...pc, visible: false } : pc)),
                        )
                      }
                      selectState={
                        c.key === "select"
                          ? allSelected
                            ? "all"
                            : someSelected
                              ? "some"
                              : "none"
                          : undefined
                      }
                      onToggleSelectAll={toggleSelectAll}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No tasks match the current filters.
              </div>
            ) : (
              grouped.map((g) => {
                const isCollapsed = collapsed.has(g.key);
                return (
                  <div key={g.key}>
                    {groupBy && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        aria-label={`${groupBy} group: ${g.label}`}
                        className="w-full text-left flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {groupBy === "priority" ? (
                          <PriorityBadge value={g.label.toLowerCase()} />
                        ) : groupBy === "complexity" ? (
                          <ComplexityBadge
                            value={
                              Object.entries(COMPLEXITY_LABEL).find(
                                ([, v]) => v === g.label,
                              )?.[0] ?? g.label
                            }
                          />
                        ) : (
                          g.label
                        )}
                        <Badge variant="outline" className="text-[10px] ml-1">
                          {g.items.length}
                        </Badge>
                      </button>
                    )}
                    {!isCollapsed &&
                      g.items.map((row) => {
                        const firmId = row.client_entities?.projects?.firm_id ?? "";
                        const projectId =
                          row.client_entities?.project_id ??
                          row.client_entities?.projects?.id ??
                          "";
                        const hasSubs = (row.task_subtasks?.length ?? 0) > 0;
                        const isOpen = expandAll || expanded.has(row.id);
                        return (
                          <div key={row.id}>
                            <Row
                              row={row}
                              visibleCols={visibleCols}
                              stagesByProject={stagesByProject}
                              nameById={nameById}
                              profileById={profileById}
                              firmId={firmId}
                              projectId={projectId}
                              selected={selected.has(row.id)}
                              onToggleSelect={() => toggleSelectOne(row.id)}
                              onPatch={(patch) => mField.mutate({ id: row.id, patch })}
                              onPeople={(roleKey, ids) =>
                                mPeople.mutate({ taskId: row.id, role: roleKey, userIds: ids })
                              }
                              isExpanded={isOpen}
                              canExpand={hasSubs}
                              onToggleExpand={() => toggleExpand(row.id)}
                            />
                            {isOpen && hasSubs && (
                              <div
                                className="sticky left-0 border-b bg-muted/20 pl-10 pr-3 py-2"
                                style={{ width: "var(--todos-viewport-width, 100%)" }}
                              >
                                <SubtaskList taskId={row.id} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─────────────── Header cell (sortable) ───────────────
function HeaderCell({
  col,
  sort,
  onToggleSort,
  onSortDir,
  filterValue,
  onFilterChange,
  onClearFilter,
  distinctValues,
  stages,
  assigneesFilter,
  reviewersFilter,
  onAssigneesFilter,
  onReviewersFilter,
  onResize,
  onHide,
  selectState,
  onToggleSelectAll,
}: {
  col: ColumnState;
  sort: SortState;
  onToggleSort: (k: ColKey, additive?: boolean) => void;
  onSortDir: (dir: "asc" | "desc") => void;
  filterValue: unknown;
  onFilterChange: (v: unknown) => void;
  onClearFilter: () => void;
  distinctValues?: Map<string, string>;
  stages: PipelineStageRow[];
  assigneesFilter: PeopleFilterValue;
  reviewersFilter: PeopleFilterValue;
  onAssigneesFilter: (v: PeopleFilterValue) => void;
  onReviewersFilter: (v: PeopleFilterValue) => void;
  onResize: (w: number) => void;
  onHide?: () => void;
  selectState?: "all" | "some" | "none";
  onToggleSelectAll?: () => void;
}) {
  const def = COLUMNS.find((d) => d.key === col.key)!;
  const sortS = sort.find((s) => s.key === col.key);
  const isSelectCol = col.key === "select";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.key,
    disabled: isSelectCol || col.key === "edit",
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (isSelectCol) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="px-2 py-1.5 flex items-center justify-center border-r"
      >
        <Checkbox
          checked={selectState === "all" ? true : selectState === "some" ? "indeterminate" : false}
          onCheckedChange={onToggleSelectAll}
          aria-label="Select all filtered"
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "px-2 py-1.5 flex items-center gap-1 group border-r last:border-r-0",
        isDragging && "bg-accent/40",
      )}
    >
      {col.key !== "edit" && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground"
          title="Drag to reorder"
        >
          <GripVertical className="h-3 w-3" />
        </span>
      )}
      <button
        type="button"
        className="flex-1 text-left truncate uppercase tracking-wide text-muted-foreground hover:text-foreground"
        onClick={(e) => onToggleSort(col.key, e.shiftKey)}
      >
        {def.label}
        {sortS &&
          (sortS.dir === "asc" ? (
            <ArrowUp className="inline h-3 w-3 ml-1" />
          ) : (
            <ArrowDown className="inline h-3 w-3 ml-1" />
          ))}
      </button>
      {col.key === "assignees" ? (
        <PeopleFilterPopover
          label="Assignees"
          value={assigneesFilter}
          onChange={onAssigneesFilter}
          meLabel="Assigned to me"
          noneLabel="Unassigned"
        />
      ) : col.key === "reviewers" ? (
        <PeopleFilterPopover
          label="Reviewers"
          value={reviewersFilter}
          onChange={onReviewersFilter}
          meLabel="Reviewed by me"
          noneLabel="No reviewer"
        />
      ) : def.filterKind && def.filterKind !== "person" ? (
        <FilterPopover
          colKey={col.key}
          kind={def.filterKind}
          value={filterValue}
          onChange={onFilterChange}
          onClear={onClearFilter}
          onSortDir={onSortDir}
          distinctValues={distinctValues}
          stages={stages}
        />
      ) : null}
      {col.key !== "edit" && onHide && (
        <button
          type="button"
          onClick={onHide}
          className="opacity-0 group-hover:opacity-70 focus-visible:opacity-100 hover:!opacity-100 text-muted-foreground hover:text-foreground transition-opacity rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          title={`Hide ${def.label} column`}
          aria-label={`Hide ${def.label} column`}
        >
          <EyeOff className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
      <ColumnResizer width={col.width} onResize={onResize} />
    </div>
  );
}

// ─────────────── Row ───────────────
function Row({
  row,
  visibleCols,
  stagesByProject,
  nameById,
  profileById,
  firmId,
  projectId,
  selected,
  onToggleSelect,
  onPatch,
  onPeople,
  isExpanded,
  canExpand,
  onToggleExpand,
}: {
  row: TodoRow;
  visibleCols: ColumnState[];
  stagesByProject: Map<string, PipelineStageRow[]>;
  nameById: Map<string, string>;
  profileById: Map<
    string,
    { id: string; full_name: string | null; email: string | null; avatar_url: string | null }
  >;
  firmId: string;
  projectId: string;
  selected: boolean;
  onToggleSelect: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onPeople: (role: "assignee" | "reviewer", ids: string[]) => void;
  isExpanded?: boolean;
  canExpand?: boolean;
  onToggleExpand?: () => void;
}) {
  const projectIdForStages =
    row.client_entities?.project_id ?? row.client_entities?.projects?.id ?? "";
  const stages = stagesByProject.get(projectIdForStages) ?? [];
  const stageHead = row.project_pipeline_stages?.primary_state;
  const assigneeIds = (row.task_assignees ?? [])
    .filter((p) => p.role === "assignee")
    .map((p) => p.user_id);
  const reviewerIds = (row.task_assignees ?? [])
    .filter((p) => p.role === "reviewer")
    .map((p) => p.user_id);

  return (
    <div
      className={cn(
        "grid border-b hover:bg-muted/30 transition-colors",
        selected && "bg-accent/40 border-l-2 border-l-primary",
      )}
      style={{ gridTemplateColumns: visibleCols.map((c) => `${c.width}px`).join(" ") }}
    >
      {visibleCols.map((c) => {
        if (c.key === "select") {
          return (
            <div key={c.key} className="px-2 py-1.5 border-r flex items-center justify-center">
              <Checkbox
                checked={selected}
                onCheckedChange={onToggleSelect}
                aria-label="Select row"
              />
            </div>
          );
        }
        const cell = renderCell(c.key, row, {
          stages,
          stageHead,
          assigneeIds,
          reviewerIds,
          nameById,
          profileById,
          firmId,
          projectId,
          onPatch,
          onPeople,
          isExpanded,
          canExpand,
          onToggleExpand,
        });
        return (
          <div
            key={c.key}
            className="px-2 py-1.5 text-xs border-r last:border-r-0 truncate flex items-center"
          >
            {cell}
          </div>
        );
      })}
    </div>
  );
}

function renderCell(
  key: ColKey,
  row: TodoRow,
  ctx: {
    stages: PipelineStageRow[];
    stageHead: string | undefined;
    assigneeIds: string[];
    reviewerIds: string[];
    nameById: Map<string, string>;
    profileById: Map<
      string,
      { id: string; full_name: string | null; email: string | null; avatar_url: string | null }
    >;

    firmId: string;
    projectId: string;
    onPatch: (patch: Record<string, unknown>) => void;
    onPeople: (role: "assignee" | "reviewer", ids: string[]) => void;
    isExpanded?: boolean;
    canExpand?: boolean;
    onToggleExpand?: () => void;
  },
) {
  switch (key) {
    case "task_id":
      return (
        <span className="font-mono text-[11px] text-muted-foreground truncate">
          {row.display_id ?? "—"}
        </span>
      );
    case "title": {
      const subs = row.task_subtasks ?? [];
      return (
        <div className="flex items-center gap-2 min-w-0">
          {row.stream === "direct" && <StreamBadge stream="direct" />}
          <TitleEdit
            value={row.title}
            onSave={(v) => ctx.onPatch({ title: v })}
            taskId={row.id}
            firmId={ctx.firmId}
            projectId={ctx.projectId}
            subtaskDone={subs.filter((s) => s.is_done).length}
            subtaskTotal={subs.length}
            isExpanded={ctx.isExpanded}
            canExpand={ctx.canExpand}
            onToggleExpand={ctx.onToggleExpand}
          />
        </div>
      );
    }
    case "firm": {
      if (row.stream === "direct") {
        return <span className="text-xs text-muted-foreground italic">B2C client</span>;
      }
      const firm = row.client_entities?.projects?.firms;
      return <FirmCode code={firm?.firm_identifier} name={firm?.name} />;
    }
    case "project": {
      if (row.stream === "direct") {
        return <span className="text-xs text-muted-foreground italic">—</span>;
      }
      const proj = row.client_entities?.projects;
      return <ProjectCode code={proj?.code} name={proj?.name} />;
    }
    case "client":
      if (row.stream === "direct") {
        return <span className="text-sm">{row.direct_clients?.display_name ?? "—"}</span>;
      }
      return (
        <ClientEntityEdit
          currentName={row.client_entities?.name ?? "—"}
          currentClientId={row.client_id ?? null}
          firmId={ctx.firmId}
          onSave={(clientId: string) => ctx.onPatch({ client_id: clientId })}
        />
      );
    case "tax_year":
      return <NumberEdit value={row.tax_year} onSave={(v) => ctx.onPatch({ tax_year: v })} />;
    case "period":
      return (
        <EnumEdit
          value={row.period ?? ""}
          options={[
            { value: "Monthly", label: "Monthly" },
            { value: "Quarterly", label: "Quarterly" },
            { value: "Yearly", label: "Yearly" },
            { value: "Ad-hoc", label: "Ad-hoc" },
          ]}
          onSave={(v) => ctx.onPatch({ period: v })}
          chipClass={periodChip(row.period)}
          display={row.period ?? "—"}
        />
      );
    case "complexity":
      return (
        <EnumEdit
          value={row.complexity}
          options={[
            { value: "a_hard", label: "A — Hard", icon: <ComplexityIcon value="a_hard" /> },
            { value: "b_medium", label: "B — Medium", icon: <ComplexityIcon value="b_medium" /> },
            { value: "c_easy", label: "C — Easy", icon: <ComplexityIcon value="c_easy" /> },
          ]}
          onSave={(v) => ctx.onPatch({ complexity: v })}
          chipClass={complexityChip(row.complexity)}
          display={COMPLEXITY_LABEL[row.complexity] ?? row.complexity}
          ariaLabel={`Difficulty: ${COMPLEXITY_LABEL[row.complexity] ?? row.complexity ?? "—"}`}
          iconOnly
          leadingIcon={<ComplexityIcon value={row.complexity} />}
        />
      );
    case "priority":
      return (
        <EnumEdit
          value={row.priority}
          options={TASK_PRIORITY_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            icon: <PriorityIcon value={o.value} />,
          }))}
          onSave={(v) => ctx.onPatch({ priority: v })}
          chipClass={priorityChip(row.priority)}
          display={row.priority}
          ariaLabel={`Urgency: ${labelFor(TASK_PRIORITY_OPTIONS, row.priority)}`}
          iconOnly
          leadingIcon={<PriorityIcon value={row.priority} />}
        />
      );
    case "due_date":
      return (
        <DateTimeEdit
          taskId={row.id}
          field="due_date"
          value={row.due_date}
          onSave={(v) => ctx.onPatch({ due_date: v })}
          overdue={isOverdue(row.due_date, row.status)}
        />
      );
    case "start_date":
      return (
        <DateTimeEdit
          taskId={row.id}
          field="start_date"
          value={row.start_date}
          onSave={(v) => ctx.onPatch({ start_date: v })}
        />
      );
    case "stage":
      return (
        <EnumEdit
          value={row.pipeline_stage_id ?? ""}
          options={ctx.stages.map((s) => ({ value: s.id, label: s.label }))}
          onSave={(v) => ctx.onPatch({ pipeline_stage_id: v })}
          chipClass={stageChip(ctx.stageHead)}
          display={row.project_pipeline_stages?.label ?? "—"}
        />
      );
    case "stage_head":
      return (
        <Badge variant="secondary" className="text-[10px]">
          {STAGE_STATE_LABEL[ctx.stageHead ?? ""] ?? "—"}
        </Badge>
      );
    case "assignees":
      return (
        <PeopleEdit
          values={ctx.assigneeIds}
          onSave={(v) => ctx.onPeople("assignee", v)}
          placeholder="Assign…"
          profileById={ctx.profileById}
        />
      );
    case "reviewers":
      return (
        <PeopleEdit
          values={ctx.reviewerIds}
          onSave={(v) => ctx.onPeople("reviewer", v)}
          placeholder="Reviewer…"
          profileById={ctx.profileById}
        />
      );
    case "edit":
      // Personal row actions — pin to My Day (strictly per-user, never shared).
      return (
        <span className="flex items-center justify-center gap-0.5">
          <MyDayToggle taskId={row.id} size="icon" />
        </span>
      );
    default:
      return null;
  }
}

function isOverdue(due: string | null, status: string) {
  if (!due || status === "complete") return false;
  return new Date(due) < new Date();
}

// ─────────────── inline editors ───────────────
function TitleEdit({
  value,
  onSave,
  taskId,
  firmId,
  projectId,
  subtaskDone,
  subtaskTotal,
  isExpanded,
  canExpand,
  onToggleExpand,
}: {
  value: string;
  onSave: (v: string) => void;
  taskId: string;
  firmId: string;
  projectId: string;
  subtaskDone: number;
  subtaskTotal: number;
  isExpanded?: boolean;
  canExpand?: boolean;
  onToggleExpand?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const canEdit = !!firmId && !!projectId;
  const progressComplete = subtaskTotal > 0 && subtaskDone >= subtaskTotal;
  return (
    <div className="group/title flex items-center gap-1 w-full min-w-0">
      {/* Expand/collapse chevron — always reserves space so titles stay aligned */}
      <button
        type="button"
        onClick={onToggleExpand}
        disabled={!canExpand}
        aria-label={isExpanded ? "Collapse subtasks" : "Expand subtasks"}
        className={cn(
          "h-5 w-5 inline-flex items-center justify-center rounded shrink-0",
          canExpand
            ? "text-muted-foreground hover:bg-accent hover:text-foreground"
            : "opacity-0 pointer-events-none",
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft !== value) onSave(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="h-7 text-xs"
        />
      ) : (
        <>
          <Link
            to="/ops/tasks/$taskId"
            params={{ taskId }}
            className="flex-1 min-w-0 text-left truncate hover:text-primary font-medium"
            title="Open task view"
          >
            {value}
          </Link>
          {subtaskTotal > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums border",
                    progressComplete
                      ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
                      : "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {subtaskDone}/{subtaskTotal}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {subtaskDone} of {subtaskTotal} subtasks completed
              </TooltipContent>
            </Tooltip>
          )}
          <span className="shrink-0 flex items-center gap-0.5">
            <TaskTimerButton taskId={taskId} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground opacity-0 group-hover/title:opacity-100"
                  aria-label="Rename task"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Rename</TooltipContent>
            </Tooltip>
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground opacity-0 group-hover/title:opacity-100"
                    aria-label="Edit task"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Edit task</TooltipContent>
              </Tooltip>
            )}
            <MyDayToggle taskId={taskId} size="icon" />
          </span>
        </>
      )}
      {sheetOpen && canEdit && (
        <CreateWorkItemModal
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          taskId={taskId}
          firmId={firmId}
          projectId={projectId}
        />
      )}
    </div>
  );
}

function ClientEntityEdit({
  currentName,
  currentClientId,
  firmId,
  onSave,
}: {
  currentName: string;
  currentClientId: string | null;
  firmId: string;
  onSave: (clientId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: clients = [] } = useQuery({
    ...firmClientsQuery(firmId),
    enabled: open && !!firmId,
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full text-left truncate hover:bg-accent/40 rounded px-1">
          {currentName}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Select
          value={currentClientId ?? ""}
          onValueChange={(v) => {
            onSave(v);
            setOpen(false);
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select client / entity…" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PopoverContent>
    </Popover>
  );
}

function NumberEdit({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  useEffect(() => setDraft(value?.toString() ?? ""), [value]);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left w-full truncate hover:bg-accent/40 rounded px-1"
      >
        {value ?? "—"}
      </button>
    );
  }
  return (
    <Input
      autoFocus
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const n = draft === "" ? null : Number(draft);
        if (n !== value) onSave(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value?.toString() ?? "");
          setEditing(false);
        }
      }}
      className="h-7 text-xs"
    />
  );
}

function DateTimeEdit({
  taskId,
  field,
  value,
  onSave,
  overdue,
}: {
  taskId: string;
  field: "due_date" | "start_date";
  value: string | null;
  onSave: (v: string | null) => void;
  overdue?: boolean;
}) {
  const current = value ? new Date(value) : null;
  const memKey = `todos.lastTime.${taskId}.${field}`;
  const readMem = (): string | null => {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem(memKey) : null;
    } catch {
      return null;
    }
  };
  const writeMem = (t: string) => {
    try {
      window.localStorage.setItem(memKey, t);
    } catch {
      /* noop */
    }
  };
  const fmtTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(current ? fmtTime(current) : (readMem() ?? "09:00"));
  useEffect(() => {
    if (current) setTime(fmtTime(current));
    else setTime(readMem() ?? "09:00");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (date: Date | undefined, t: string) => {
    if (!date) {
      onSave(null);
      return;
    }
    const [hh, mm] = (t || "00:00").split(":").map((n) => parseInt(n, 10) || 0);
    const d = new Date(date);
    d.setHours(hh, mm, 0, 0);
    const iso = d.toISOString();
    writeMem(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
    if (iso !== value) onSave(iso);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 w-full text-left text-xs hover:bg-accent/40 rounded px-1 min-w-0",
            overdue && "text-rose-600 dark:text-rose-300 font-medium",
          )}
        >
          <CalendarIcon className="h-3 w-3 shrink-0 opacity-60" />
          <span className="truncate">{fmtDateTime(value)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={current ?? undefined}
          onSelect={(d) => commit(d, time)}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        <div className="flex items-center gap-2 border-t p-2">
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => commit(current ?? new Date(), time)}
            className="h-7 text-xs"
          />
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onSave(null);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EnumEdit({
  value,
  options,
  onSave,
  chipClass,
  display,
  leadingIcon,
  iconOnly,
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  onSave: (v: string) => void;
  chipClass: string;
  display: string;
  leadingIcon?: React.ReactNode;
  iconOnly?: boolean;
  ariaLabel?: string;
}) {
  const label = ariaLabel ?? display;
  return (
    <Select
      value={value || ""}
      onValueChange={(v) => {
        if (v !== value) onSave(v);
      }}
    >
      <SelectTrigger
        aria-label={label}
        title={iconOnly ? label : undefined}
        className={cn(
          "h-7 text-[11px] border-transparent bg-transparent hover:bg-accent/40 w-full",
          iconOnly ? "px-1 justify-center [&>svg]:hidden" : "px-1 [&>svg]:opacity-50",
        )}
      >
        {iconOnly ? (
          <span className="inline-flex items-center justify-center">
            {leadingIcon ?? <span className="text-muted-foreground">—</span>}
          </span>
        ) : (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 truncate inline-flex items-center gap-1 max-w-full capitalize border",
              chipClass,
            )}
          >
            {leadingIcon}
            <span className="truncate">{display}</span>
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PeopleEdit({
  values,
  onSave,
  placeholder,
  profileById,
}: {
  values: string[];
  onSave: (v: string[]) => void;
  placeholder?: string;
  profileById: Map<
    string,
    { id: string; full_name: string | null; email: string | null; avatar_url: string | null }
  >;
}) {
  const [local, setLocal] = useState(values);
  const dirtyRef = useRef(false);
  useEffect(() => {
    setLocal(values);
    dirtyRef.current = false;
  }, [values.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelFor = (id: string) => {
    const p = profileById.get(id);
    return p?.full_name || p?.email || id.slice(0, 6);
  };
  return (
    <Popover
      onOpenChange={(o) => {
        if (!o && dirtyRef.current) {
          dirtyRef.current = false;
          onSave(local);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full text-left text-xs hover:bg-accent/40 rounded px-1 flex items-center gap-1 min-w-0 h-7"
        >
          {local.length === 0 ? (
            <span className="text-muted-foreground">{placeholder ?? "—"}</span>
          ) : (
            <span className="flex -space-x-1.5 items-center shrink-0">
              {local.slice(0, 3).map((id) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <UserAvatar
                        profile={profileById.get(id) ?? null}
                        size="sm"
                        className="border border-background rounded-full"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">{labelFor(id)}</TooltipContent>
                </Tooltip>
              ))}
              {local.length > 3 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-background bg-muted text-[10px] font-medium text-muted-foreground">
                      +{local.length - 3}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {local.slice(3).map(labelFor).join(", ")}
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <MultiPersonPicker
          values={local}
          onChange={(v) => {
            setLocal(v);
            dirtyRef.current = true;
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ─────────────── column resizer ───────────────
function ColumnResizer({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const startX = useRef(0);
  const startW = useRef(0);
  return (
    <span
      role="separator"
      onMouseDown={(e) => {
        e.stopPropagation();
        startX.current = e.clientX;
        startW.current = width;
        const onMove = (ev: MouseEvent) =>
          onResize(Math.max(60, startW.current + (ev.clientX - startX.current)));
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      className="ml-1 h-4 w-1 cursor-col-resize rounded bg-border opacity-0 group-hover:opacity-100"
    />
  );
}

// ─────────────── Excel-style filter popover ───────────────
type ColumnFilter = {
  op?: string;
  value?: string;
  value2?: string;
  selected?: string[];
};

function normalizeColumnFilter(v: unknown): ColumnFilter | null {
  if (v == null || v === "") return null;
  if (Array.isArray(v)) {
    return v.length ? { selected: v as string[] } : null;
  }
  if (typeof v === "string") {
    return { op: "contains", value: v };
  }
  if (typeof v === "object") {
    const f = v as ColumnFilter;
    const opNeedsNoValue =
      f.op === "blank" ||
      f.op === "not_blank" ||
      f.op === "overdue" ||
      f.op === "due_today" ||
      f.op === "due_this_week";
    const hasOp = !!f.op && (opNeedsNoValue || (f.value != null && f.value !== ""));
    const hasSel = !!f.selected && f.selected.length > 0;
    if (!hasOp && !hasSel) return null;
    return f;
  }
  return null;
}

function matchesColumnFilter(
  cellRaw: string | number | null | undefined,
  f: ColumnFilter,
): boolean {
  const cell = cellRaw == null ? "" : String(cellRaw);
  const cellLc = cell.toLowerCase();
  const v = (f.value ?? "").toString();
  const v2 = (f.value2 ?? "").toString();
  const vLc = v.toLowerCase();
  const isBlank = cell === "";

  if (f.op) {
    switch (f.op) {
      case "contains":
        if (v && !cellLc.includes(vLc)) return false;
        break;
      case "not_contains":
        if (v && cellLc.includes(vLc)) return false;
        break;
      case "equals":
        if (v && cellLc !== vLc) return false;
        break;
      case "not_equals":
        if (v && cellLc === vLc) return false;
        break;
      case "starts_with":
        if (v && !cellLc.startsWith(vLc)) return false;
        break;
      case "ends_with":
        if (v && !cellLc.endsWith(vLc)) return false;
        break;
      case "blank":
        if (!isBlank) return false;
        break;
      case "not_blank":
        if (isBlank) return false;
        break;
      case "eq":
        if (v && Number(cell) !== Number(v)) return false;
        break;
      case "neq":
        if (v && Number(cell) === Number(v)) return false;
        break;
      case "gt":
        if (v && !(Number(cell) > Number(v))) return false;
        break;
      case "lt":
        if (v && !(Number(cell) < Number(v))) return false;
        break;
      case "gte":
        if (v && !(Number(cell) >= Number(v))) return false;
        break;
      case "lte":
        if (v && !(Number(cell) <= Number(v))) return false;
        break;
      case "between":
        if (v && v2 && !(Number(cell) >= Number(v) && Number(cell) <= Number(v2))) return false;
        break;
      case "date_on":
        if (v && cell !== v) return false;
        break;
      case "date_before":
        if (v && !(cell && cell < v)) return false;
        break;
      case "date_after":
        if (v && !(cell && cell > v)) return false;
        break;
      case "date_on_before":
        if (v && !(cell && cell <= v)) return false;
        break;
      case "date_on_after":
        if (v && !(cell && cell >= v)) return false;
        break;
      case "date_between":
        if (v && v2 && !(cell && cell >= v && cell <= v2)) return false;
        break;
      case "overdue": {
        const today = new Date().toISOString().slice(0, 10);
        if (isBlank || !(cell < today)) return false;
        break;
      }
      case "due_today": {
        const today = new Date().toISOString().slice(0, 10);
        if (cell !== today) return false;
        break;
      }
      case "due_this_week": {
        const now = new Date();
        const day = now.getDay();
        const start = new Date(now);
        start.setDate(now.getDate() - day);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const s = start.toISOString().slice(0, 10);
        const e = end.toISOString().slice(0, 10);
        if (isBlank || !(cell >= s && cell <= e)) return false;
        break;
      }
    }
  }

  if (f.selected && f.selected.length > 0) {
    if (!f.selected.includes(cell)) return false;
  }

  return true;
}

const TEXT_OPS: Array<{ value: string; label: string }> = [
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "blank", label: "Is blank" },
  { value: "not_blank", label: "Is not blank" },
];

const NUMBER_OPS: Array<{ value: string; label: string }> = [
  { value: "eq", label: "= equals" },
  { value: "neq", label: "≠ does not equal" },
  { value: "gt", label: "> greater than" },
  { value: "lt", label: "< less than" },
  { value: "gte", label: "≥ greater or equal" },
  { value: "lte", label: "≤ less or equal" },
  { value: "between", label: "Between" },
  { value: "blank", label: "Is blank" },
  { value: "not_blank", label: "Is not blank" },
];

const DATE_OPS: Array<{ value: string; label: string }> = [
  { value: "date_on", label: "On" },
  { value: "date_before", label: "Before" },
  { value: "date_after", label: "After" },
  { value: "date_on_before", label: "On or before" },
  { value: "date_on_after", label: "On or after" },
  { value: "date_between", label: "Between" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due today" },
  { value: "due_this_week", label: "Due this week" },
  { value: "blank", label: "Is blank" },
  { value: "not_blank", label: "Is not blank" },
];

function FilterPopover({
  colKey,
  kind,
  value,
  onChange,
  onClear,
  onSortDir,
  distinctValues,
  stages,
}: {
  colKey: ColKey;
  kind: ColDef["filterKind"];
  value: unknown;
  onChange: (v: unknown) => void;
  onClear: () => void;
  onSortDir: (dir: "asc" | "desc") => void;
  distinctValues?: Map<string, string>;
  stages: PipelineStageRow[];
}) {
  const current: ColumnFilter = useMemo(() => {
    const n = normalizeColumnFilter(value);
    return n ?? {};
  }, [value]);

  const has = !!normalizeColumnFilter(value);

  const setOp = (op: string) => {
    const next: ColumnFilter = { ...current, op };
    if (
      op === "blank" ||
      op === "not_blank" ||
      op === "overdue" ||
      op === "due_today" ||
      op === "due_this_week"
    ) {
      next.value = undefined;
      next.value2 = undefined;
    }
    if (op !== "between" && op !== "date_between") next.value2 = undefined;
    onChange(next);
  };
  const setVal = (val: string) => onChange({ ...current, value: val });
  const setVal2 = (val: string) => onChange({ ...current, value2: val });

  const curated = useMemo(() => {
    if (kind === "select" && colKey === "complexity") {
      return Object.entries(COMPLEXITY_LABEL).map(([v, l]) => ({ value: v, label: l }));
    }
    if (kind === "select" && colKey === "priority") {
      return TASK_PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
    }
    if (kind === "select" && colKey === "stage_head") {
      return Object.entries(STAGE_STATE_LABEL).map(([v, l]) => ({ value: v, label: l }));
    }
    if (kind === "stage") {
      const uniq = [...new Map(stages.map((s) => [s.label, s])).values()];
      return uniq.map((s) => ({ value: s.id, label: s.label }));
    }
    if (distinctValues) {
      return [...distinctValues.entries()]
        .map(([v, l]) => ({ value: v, label: l }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    return [];
  }, [kind, colKey, distinctValues, stages]);

  const [search, setSearch] = useState("");
  const filteredCurated = useMemo(
    () => curated.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase())),
    [curated, search],
  );
  const selectedSet = useMemo(() => new Set(current.selected ?? []), [current]);
  const toggleVal = (v: string) => {
    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange({ ...current, selected: next.size === 0 ? undefined : Array.from(next) });
  };
  const selectAll = () => onChange({ ...current, selected: filteredCurated.map((o) => o.value) });
  const clearSelected = () => onChange({ ...current, selected: undefined });

  const showOperator = kind === "text" || kind === "number" || kind === "date";
  const showChecklist =
    kind === "text" || kind === "select" || kind === "stage" || kind === "number";
  const opNeedsValue =
    current.op &&
    !["blank", "not_blank", "overdue", "due_today", "due_this_week"].includes(current.op);
  const opNeedsTwoValues = current.op === "between" || current.op === "date_between";

  const ops = kind === "number" ? NUMBER_OPS : kind === "date" ? DATE_OPS : TEXT_OPS;
  const inputType = kind === "number" ? "number" : kind === "date" ? "date" : "text";

  const sortLabels =
    kind === "number"
      ? { asc: "Sort smallest → largest", desc: "Sort largest → smallest" }
      : kind === "date"
        ? { asc: "Sort oldest → newest", desc: "Sort newest → oldest" }
        : { asc: "Sort A → Z", desc: "Sort Z → A" };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded p-0.5",
            has ? "text-primary" : "text-muted-foreground opacity-60 hover:opacity-100",
          )}
        >
          <FilterIcon className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="border-b p-1">
          <button
            type="button"
            onClick={() => onSortDir("asc")}
            className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent rounded flex items-center gap-2"
          >
            <ArrowUp className="h-3 w-3" /> {sortLabels.asc}
          </button>
          <button
            type="button"
            onClick={() => onSortDir("desc")}
            className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent rounded flex items-center gap-2"
          >
            <ArrowDown className="h-3 w-3" /> {sortLabels.desc}
          </button>
        </div>
        {showOperator && (
          <div className="p-2 border-b space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Condition
            </Label>
            <Select value={current.op ?? ""} onValueChange={setOp}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {ops.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {opNeedsValue && (
              <Input
                type={inputType}
                placeholder="Value"
                value={current.value ?? ""}
                onChange={(e) => setVal(e.target.value)}
                className="h-8 text-xs"
              />
            )}
            {opNeedsTwoValues && (
              <Input
                type={inputType}
                placeholder="And"
                value={current.value2 ?? ""}
                onChange={(e) => setVal2(e.target.value)}
                className="h-8 text-xs"
              />
            )}
          </div>
        )}
        {showChecklist && curated.length > 0 && (
          <div className="p-2">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 block">
              Values
            </Label>
            <Input
              placeholder="Search values…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs mb-1"
            />
            <div className="flex items-center justify-between text-[11px] mb-1 px-1">
              <button type="button" className="text-primary hover:underline" onClick={selectAll}>
                Select all
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={clearSelected}
              >
                Clear
              </button>
            </div>
            <ScrollArea className="max-h-48">
              <div className="space-y-0.5 pr-2">
                {filteredCurated.map((o) => (
                  <label
                    key={o.value}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent/40 cursor-pointer text-xs"
                  >
                    <Checkbox
                      checked={selectedSet.has(o.value)}
                      onCheckedChange={() => toggleVal(o.value)}
                    />
                    <span className="truncate">{o.label}</span>
                  </label>
                ))}
                {filteredCurated.length === 0 && (
                  <div className="text-[11px] text-muted-foreground px-1 py-2">No values</div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
        {has && (
          <div className="border-t p-1">
            <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={onClear}>
              <X className="h-3 w-3 mr-1" /> Clear filter
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─────────────── columns config (show/hide + reorder) ───────────────
function ColumnsConfigButton({
  columns,
  setColumns,
}: {
  columns: ColumnState[];
  setColumns: (next: ColumnState[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ordered = [...columns].sort((a, b) => a.order - b.order);
  function move(idx: number, delta: number) {
    const next = [...ordered];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setColumns(next.map((c, i) => ({ ...c, order: i })));
  }
  function toggle(key: ColKey) {
    setColumns(columns.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          title="Columns settings"
          aria-label="Columns settings"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Columns</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-1">
            {ordered.map((c, i) => {
              const def = COLUMNS.find((d) => d.key === c.key)!;
              if (c.key === "edit" || c.key === "select") return null;
              return (
                <div
                  key={c.key}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/40"
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <Checkbox
                    id={`col-vis-${c.key}`}
                    checked={c.visible}
                    onCheckedChange={() => toggle(c.key)}
                    aria-label={`${c.visible ? "Hide" : "Show"} ${def.label} column`}
                  />
                  <Label htmlFor={`col-vis-${c.key}`} className="flex-1 text-sm cursor-pointer">
                    {def.label}
                  </Label>
                  {c.visible ? (
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`Move ${def.label} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={i === ordered.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Move ${def.label} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => {
              // Reset columns: restore default visibility + widths, keep current order.
              const defs = defaultColumns();
              const widthByKey = new Map(defs.map((d) => [d.key, d.width]));
              setColumns(
                columns.map((c) => ({
                  ...c,
                  visible: defs.find((d) => d.key === c.key)?.visible ?? true,
                  width: widthByKey.get(c.key) ?? c.width,
                })),
              );
              toast.success("Columns reset to default visibility and widths");
            }}
          >
            Reset columns
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setColumns(defaultColumns());
              toast.success("Columns reset to default (order, visibility, widths)");
            }}
          >
            Reset all
          </Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────── Compact (split-pane) shell ───────────────

function CompactModeShell({
  mode,
  setMode,
}: {
  mode: TodosDisplayMode;
  setMode: (m: TodosDisplayMode) => void;
}) {
  return (
    <TodosSplitShell
      headerExtras={
        <div
          className="inline-flex rounded-md border bg-background p-0.5"
          role="tablist"
          aria-label="View mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "table"}
            onClick={() => setMode("table")}
            className={cn(
              "px-2.5 h-7 text-xs rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "text-muted-foreground hover:text-foreground",
            )}
            title="Table view"
            aria-label="Switch to Table view"
          >
            Table
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "compact"}
            onClick={() => setMode("compact")}
            className={cn(
              "px-2.5 h-7 text-xs rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              mode === "compact"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Split view (list + detail)"
            aria-label="Switch to Split (list and detail) view"
          >
            Split
          </button>
        </div>
      }
    />
  );
}
