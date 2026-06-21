import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RotateCcw, Keyboard, Sun, User, Users, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { cn } from "@/lib/shared/utils";
import { usePersistentSelection } from "@/lib/ops/use-persistent-selection";
import { TodosListPane, type TodosListPaneHandle, type TodosScope } from "./todos-list-pane";
import { TodosDetailPane } from "./todos-detail-pane";
import { TodosShortcutsDialog } from "./shortcuts-dialog";
import {
  TodosFilterBar,
  EMPTY_TODOS_EXTRA,
  todosExtraActiveCount,
  type TodosExtraFilters,
  type TodosFacetCounts,
  type TodosDuePreset,
} from "./todos-filter-bar";
import { QuickViewsMenu } from "@/components/shared/quick-views-menu";
import { computeFacets } from "@/lib/ops/facets";
import { istDayStart, istDayEnd, istWeekEnd } from "@/lib/ops/date-buckets";
import { rowsToCsv, downloadCsv } from "@/components/ops/todos-export-csv";
import { todosQuery, myDayActiveQuery, type TodoRow } from "@/lib/queries/ops.queries";
import { useAuth } from "@/lib/auth/auth-context";

const PANE_KEY = "ops-todos";
const SELECTED_LS_KEY = "todos.split.selectedTaskId";
const QV_STORAGE_KEY = "ops.todos.quick-views.v1";
const QV_LEGACY_KEY = "ops.todos.saved-filters.v1";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
}

export interface TodosFilterSnapshot {
  scope: TodosScope;
  myDayOnly: boolean;
  search: string;
  extra?: TodosExtraFilters;
}

function snapshotEquals(a: TodosFilterSnapshot, b: TodosFilterSnapshot): boolean {
  if (a.scope !== b.scope || a.myDayOnly !== b.myDayOnly || a.search.trim() !== b.search.trim())
    return false;
  const ax = a.extra ?? EMPTY_TODOS_EXTRA;
  const bx = b.extra ?? EMPTY_TODOS_EXTRA;
  const arrEq = (x: string[], y: string[]) =>
    x.length === y.length && [...x].sort().join("|") === [...y].sort().join("|");
  return (
    arrEq(ax.stageHeads, bx.stageHeads) &&
    arrEq(ax.priorities, bx.priorities) &&
    arrEq(ax.complexities, bx.complexities) &&
    arrEq(ax.firmIds, bx.firmIds) &&
    arrEq(ax.projectIds, bx.projectIds) &&
    arrEq(ax.assigneeIds, bx.assigneeIds) &&
    arrEq(ax.streams ?? [], bx.streams ?? []) &&
    ax.due === bx.due
  );
}

function snapshotIsEmpty(s: TodosFilterSnapshot): boolean {
  return (
    s.scope === "all" &&
    !s.myDayOnly &&
    !s.search.trim() &&
    todosExtraActiveCount(s.extra ?? EMPTY_TODOS_EXTRA) === 0
  );
}

/**
 * Split-pane To-Do shell mirroring the Open Points page architecture.
 * Single combined filter/action row, faceted filter chips with counts,
 * user-defined Quick Views.
 */
export function TodosSplitShell({ headerExtras }: { headerExtras?: React.ReactNode }) {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery(todosQuery(user?.id, role));
  const { data: myDayRows = [] } = useQuery(myDayActiveQuery(user?.id));
  const myDaySet = useMemo(() => new Set(myDayRows.map((r) => r.task_id)), [myDayRows]);

  const [scope, setScope] = useState<TodosScope>("mine");
  const [myDayOnly, setMyDayOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [extra, setExtra] = useState<TodosExtraFilters>(EMPTY_TODOS_EXTRA);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedId, setSelectedId] = usePersistentSelection(SELECTED_LS_KEY);

  const listRef = useRef<TodosListPaneHandle>(null);
  const gKeyAt = useRef(0);

  useEffect(() => {
    if (rows.length === 0) return;
    if (selectedId && rows.some((r) => r.id === selectedId)) return;
    setSelectedId(rows[0].id);
  }, [rows, selectedId, setSelectedId]);

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["todos"] });
    queryClient.invalidateQueries({ queryKey: ["my-day-active"] });
    toast.success("Refreshed");
  }, [queryClient]);

  const resetWidth = () =>
    window.dispatchEvent(new CustomEvent("wi-pane:reset", { detail: { storageKey: PANE_KEY } }));

  const exportCsv = useCallback(
    (mode: "filtered" | "full") => {
      const ids = mode === "filtered" ? new Set(listRef.current?.getVisibleIds() ?? []) : null;
      const items = ids ? rows.filter((r) => ids.has(r.id)) : rows;
      const csv = rowsToCsv(
        [{ label: "Tasks", items }],
        [
          { key: "task_id", label: "Task ID" },
          { key: "title", label: "Task" },
          { key: "firm", label: "Firm" },
          { key: "project", label: "Project" },
          { key: "client", label: "Client" },
          { key: "stage", label: "Stage" },
          { key: "priority", label: "Priority" },
          { key: "due_date", label: "Due" },
        ],
        new Map(),
        false,
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`todos-${mode}-${stamp}.csv`, csv);
      toast.success("CSV downloaded");
    },
    [rows],
  );

  const snapshot: TodosFilterSnapshot = { scope, myDayOnly, search, extra };
  const applySnapshot = (s: TodosFilterSnapshot) => {
    setScope(s.scope);
    setMyDayOnly(s.myDayOnly);
    setSearch(s.search);
    setExtra(s.extra ?? EMPTY_TODOS_EXTRA);
  };

  // ── Faceted counts ──────────────────────────────────────────────
  // Compute counts over rows scoped by scope/myDay/search but exclude each
  // facet's own predicate so its options keep multiple selectable values.
  const facetCounts: TodosFacetCounts = useMemo(() => {
    const ex = extra;
    const q = search.trim().toLowerCase();
    const startToday = istDayStart();
    const endToday = istDayEnd();
    const endWeek = istWeekEnd();

    const baseRows = rows.filter((r) => {
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
        const firm = r.client_entities?.projects?.firms?.name ?? "";
        const project = r.client_entities?.projects?.name ?? "";
        const client = r.client_entities?.name ?? "";
        const hay = `${r.title} ${r.display_id ?? ""} ${firm} ${project} ${client}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const duePred = (r: TodoRow): boolean => {
      if (ex.due === "any") return true;
      const dueStr = r.due_date;
      if (ex.due === "no_date") return dueStr == null;
      if (dueStr == null) return false;
      const t = new Date(dueStr).getTime();
      if (ex.due === "overdue") return t < startToday && r.status !== "done";
      if (ex.due === "today") return t >= startToday && t < endToday;
      if (ex.due === "this_week") return t >= startToday && t < endWeek;
      return true;
    };

    const predicates = {
      stageHeads: (r: TodoRow) =>
        !ex.stageHeads.length ||
        (!!r.project_pipeline_stages?.primary_state &&
          ex.stageHeads.includes(r.project_pipeline_stages.primary_state)),
      priorities: (r: TodoRow) => !ex.priorities.length || ex.priorities.includes(r.priority),
      complexities: (r: TodoRow) =>
        !ex.complexities.length || ex.complexities.includes(r.complexity),
      firmIds: (r: TodoRow) =>
        !ex.firmIds.length ||
        (r.stream === "direct"
          ? !!r.direct_client_id && ex.firmIds.includes(r.direct_client_id)
          : !!r.client_entities?.projects?.firm_id &&
            ex.firmIds.includes(r.client_entities.projects.firm_id)),
      projectIds: (r: TodoRow) =>
        !ex.projectIds.length || (!!r.project_id && ex.projectIds.includes(r.project_id)),
      assigneeIds: (r: TodoRow) => {
        if (!ex.assigneeIds.length) return true;
        const set = new Set(ex.assigneeIds);
        return (
          (!!r.assignee_id && set.has(r.assignee_id)) ||
          (r.task_assignees ?? []).some((p) => set.has(p.user_id))
        );
      },
      due: duePred,
    };

    const extractors = {
      stageHeads: (r: TodoRow) => r.project_pipeline_stages?.primary_state ?? null,
      priorities: (r: TodoRow) => r.priority,
      complexities: (r: TodoRow) => r.complexity,
      firmIds: (r: TodoRow) =>
        r.stream === "direct"
          ? (r.direct_client_id ?? null)
          : (r.client_entities?.projects?.firm_id ?? null),
      projectIds: (r: TodoRow) => r.project_id ?? null,
      assigneeIds: (r: TodoRow) => {
        const ids: string[] = [];
        if (r.assignee_id) ids.push(r.assignee_id);
        for (const p of r.task_assignees ?? []) ids.push(p.user_id);
        return ids;
      },
      due: (r: TodoRow): string | null => {
        const dueStr = r.due_date;
        if (dueStr == null) return "no_date";
        const t = new Date(dueStr).getTime();
        if (t < startToday && r.status !== "done") return "overdue";
        if (t >= startToday && t < endToday) return "today";
        if (t >= startToday && t < endWeek) return "this_week";
        return null;
      },
    };

    const result = computeFacets<TodoRow>(baseRows, predicates, extractors);
    return result as TodosFacetCounts;
  }, [rows, scope, user, myDayOnly, myDaySet, search, extra]);

  // Keyboard shortcuts — Communication-hub convention.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const now = Date.now();
      const inGSeq = now - gKeyAt.current < 1000;
      if (inGSeq) {
        if (e.key === "m") {
          e.preventDefault();
          setScope("mine");
          gKeyAt.current = 0;
          return;
        }
        if (e.key === "a") {
          e.preventDefault();
          setScope("all");
          gKeyAt.current = 0;
          return;
        }
        gKeyAt.current = 0;
      }
      switch (e.key) {
        case "/":
          e.preventDefault();
          listRef.current?.focusSearch();
          break;
        case "?":
          e.preventDefault();
          setHelpOpen(true);
          break;
        case "r":
          e.preventDefault();
          refreshAll();
          break;
        case "a":
          e.preventDefault();
          setScope("all");
          break;
        case "m":
          e.preventDefault();
          setScope("mine");
          break;
        case "u":
          e.preventDefault();
          setScope("unassigned");
          break;
        case "d":
          e.preventDefault();
          setMyDayOnly((v) => !v);
          break;
        case "1":
          e.preventDefault();
          listRef.current?.moveTaskFocus(1);
          break;
        case "7":
          e.preventDefault();
          listRef.current?.moveTaskFocus(-1);
          break;
        case "2":
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("wi-pane:nudge", { detail: { storageKey: PANE_KEY, delta: -4 } }),
          );
          break;
        case "8":
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("wi-pane:nudge", { detail: { storageKey: PANE_KEY, delta: 4 } }),
          );
          break;
        case "g":
          gKeyAt.current = now;
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refreshAll]);

  const extraCount = todosExtraActiveCount(extra);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Single combined filter / action bar */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b shrink-0">
        <div className="flex items-center gap-1 shrink-0">
          <ScopeChip active={scope === "mine"} onClick={() => setScope("mine")} label="Mine (m)">
            <User className="h-3.5 w-3.5" />
          </ScopeChip>
          <ScopeChip active={scope === "all"} onClick={() => setScope("all")} label="All (a)">
            <Users className="h-3.5 w-3.5" />
          </ScopeChip>
          <ScopeChip
            active={scope === "unassigned"}
            onClick={() => setScope("unassigned")}
            label="Unassigned (u)"
          >
            <UserX className="h-3.5 w-3.5" />
          </ScopeChip>
        </div>
        <Button
          type="button"
          size="sm"
          variant={myDayOnly ? "default" : "ghost"}
          className={cn(
            "h-7 px-2 text-[11px] gap-1 shrink-0",
            myDayOnly && "bg-amber-500 hover:bg-amber-500/90 text-white",
          )}
          onClick={() => setMyDayOnly((v) => !v)}
          aria-pressed={myDayOnly}
          title="Filter to My Day (d)"
        >
          <Sun className={cn("h-3 w-3", myDayOnly && "fill-amber-200")} />
          My Day
        </Button>
        <TodosFilterBar value={extra} onChange={setExtra} counts={facetCounts} />
        {extraCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-[11px] shrink-0"
            onClick={() => setExtra(EMPTY_TODOS_EXTRA)}
          >
            Clear ({extraCount})
          </Button>
        )}
        <div className="flex-1" />
        {headerExtras}
        <div className="h-6 w-px bg-border shrink-0" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={resetWidth}
          title="Reset pane width"
          aria-label="Reset pane width"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <QuickViewsMenu<TodosFilterSnapshot>
          storageKey={QV_STORAGE_KEY}
          userPrefScope="ops.todos.quickViews"
          legacyKey={QV_LEGACY_KEY}
          migrateLegacy={(it) => {
            if (!it || typeof it !== "object") return null;
            const obj = it as Partial<TodosFilterSnapshot>;
            return {
              scope: (obj.scope ?? "all") as TodosScope,
              myDayOnly: !!obj.myDayOnly,
              search: obj.search ?? "",
              extra: obj.extra ?? EMPTY_TODOS_EXTRA,
            };
          }}
          current={snapshot}
          onApply={applySnapshot}
          equals={snapshotEquals}
          isEmpty={snapshotIsEmpty}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" className="h-8 w-8" title="Export" aria-label="Export">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => exportCsv("filtered")}>
              Export current view (filtered)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportCsv("full")}>Export full list</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => setHelpOpen(true)}
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </div>

      {/* Split pane */}
      <div className="flex-1 min-h-0 px-3 py-2 overflow-hidden">
        <div className="h-full">
          <ResizableTwoPane
            storageKey={PANE_KEY}
            defaultLeft={20}
            hideToolbar
            left={
              <div className="rounded-lg border bg-card h-full min-h-0 overflow-hidden">
                <TodosListPane
                  ref={listRef}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  scope={scope}
                  myDayOnly={myDayOnly}
                  search={search}
                  onSearchChange={setSearch}
                  extra={extra}
                />
              </div>
            }
            right={
              <div className="rounded-lg border bg-card h-full min-h-0 overflow-hidden">
                <TodosDetailPane taskId={selectedId} />
              </div>
            }
          />
        </div>
      </div>

      <TodosShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "h-7 w-7 grid place-items-center rounded-md text-[11px] transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ── Re-export for callers that previously imported the snapshot type from
//    the old saved-filters-menu module.
export type { TodosFilterSnapshot as TodosFilterSnapshotType };
