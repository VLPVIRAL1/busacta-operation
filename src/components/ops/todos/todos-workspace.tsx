import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sun, User, Users, UserX, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { useUserPref } from "@/lib/ops/user-prefs";
import { usePersistentSelection } from "@/lib/ops/use-persistent-selection";
import { computeFacets } from "@/lib/ops/facets";
import { istDayStart, istDayEnd, istWeekEnd } from "@/lib/ops/date-buckets";
import { QuickViewsMenu } from "@/components/shared/quick-views-menu";
import { rowsToCsv, downloadCsv } from "@/components/ops/todos-export-csv";
import { todosQuery, myDayActiveQuery, type TodoRow } from "@/lib/queries/ops.queries";
import {
  TodosFilterBar,
  EMPTY_TODOS_EXTRA,
  todosExtraActiveCount,
  type TodosExtraFilters,
  type TodosFacetCounts,
} from "./todos-filter-bar";
import { filterTodoRows, type TodosScope } from "./todos-filter";
import { TodosTableBody } from "@/components/ops/todos-table";
import { TodosSplitBody } from "./todos-split-shell";

export type TodosDisplayMode = "table" | "compact";

const QV_STORAGE_KEY = "ops.todos.quick-views.v1";
const QV_LEGACY_KEY = "ops.todos.saved-filters.v1";
const SELECTED_LS_KEY = "todos.split.selectedTaskId";

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
 * To-Do workspace shell. Owns the SHARED filter state (scope + My Day + search +
 * faceted chips) and renders Table / Split as tabs with one common filter bar
 * beneath them. Because this parent stays mounted while only the body swaps,
 * filters are retained when switching views, and both views filter identically
 * via {@link filterTodoRows}.
 */
export function TodosWorkspace() {
  const { user, role } = useAuth();
  const userId = user?.id ?? "";

  const { value: mode, setValue: setMode } = useUserPref<TodosDisplayMode>(
    "ops.todos.displayMode",
    "compact",
  );

  // Shared filter state — retained across Table/Split because this stays mounted.
  const [scope, setScope] = useState<TodosScope>("mine");
  const [myDayOnly, setMyDayOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [extra, setExtra] = useState<TodosExtraFilters>(EMPTY_TODOS_EXTRA);
  const [selectedId, setSelectedId] = usePersistentSelection(SELECTED_LS_KEY);

  const { data: rows = [] } = useQuery(todosQuery(userId, role));
  const { data: myDayRows = [] } = useQuery(myDayActiveQuery(userId));
  const myDaySet = useMemo(() => new Set(myDayRows.map((r) => r.task_id)), [myDayRows]);

  const filtered = useMemo(
    () => filterTodoRows(rows, { scope, myDayOnly, myDaySet, search, extra, userId }),
    [rows, scope, myDayOnly, myDaySet, search, extra, userId],
  );

  // Faceted counts — scope/myDay/search-narrowed rows, each facet excluding its
  // own predicate so all its options stay selectable.
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
        (!!r.client_entities?.projects?.firm_id &&
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
      streams: (r: TodoRow) =>
        !ex.streams?.length || ex.streams.includes(r.stream as "cpa" | "direct"),
      due: duePred,
    };

    const extractors = {
      stageHeads: (r: TodoRow) => r.project_pipeline_stages?.primary_state ?? null,
      priorities: (r: TodoRow) => r.priority,
      complexities: (r: TodoRow) => r.complexity,
      firmIds: (r: TodoRow) => r.client_entities?.projects?.firm_id ?? null,
      projectIds: (r: TodoRow) => r.project_id ?? null,
      assigneeIds: (r: TodoRow) => {
        const ids: string[] = [];
        if (r.assignee_id) ids.push(r.assignee_id);
        for (const p of r.task_assignees ?? []) ids.push(p.user_id);
        return ids;
      },
      streams: (r: TodoRow) => r.stream as string,
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

    return computeFacets<TodoRow>(baseRows, predicates, extractors) as TodosFacetCounts;
  }, [rows, scope, user, myDayOnly, myDaySet, search, extra]);

  const snapshot: TodosFilterSnapshot = { scope, myDayOnly, search, extra };
  const applySnapshot = (s: TodosFilterSnapshot) => {
    setScope(s.scope);
    setMyDayOnly(s.myDayOnly);
    setSearch(s.search);
    setExtra(s.extra ?? EMPTY_TODOS_EXTRA);
  };

  const exportCsv = () => {
    const csv = rowsToCsv(
      [{ label: "Tasks", items: filtered }],
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
    downloadCsv(`todos-${stamp}.csv`, csv);
    toast.success("CSV downloaded");
  };

  const extraCount = todosExtraActiveCount(extra);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Tabs row — Table / Split */}
      <div className="flex items-center gap-1 border-b px-3 pt-1.5 shrink-0">
        <TabButton active={mode === "table"} onClick={() => setMode("table")}>
          Table
        </TabButton>
        <TabButton active={mode === "compact"} onClick={() => setMode("compact")}>
          Split
        </TabButton>
        <div className="ml-auto flex items-center gap-1 pb-1">
          <QuickViewsMenu<TodosFilterSnapshot>
            storageKey={QV_STORAGE_KEY}
            userPrefScope="ops.todos.quickViews"
            legacyKey={QV_LEGACY_KEY}
            current={snapshot}
            onApply={applySnapshot}
            equals={snapshotEquals}
            isEmpty={snapshotIsEmpty}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Export">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={exportCsv}>Export current view (CSV)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Common filter bar — shared by both views */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-1 shrink-0">
          <ScopeChip active={scope === "mine"} onClick={() => setScope("mine")} label="Mine">
            <User className="h-3.5 w-3.5" />
          </ScopeChip>
          <ScopeChip active={scope === "all"} onClick={() => setScope("all")} label="All">
            <Users className="h-3.5 w-3.5" />
          </ScopeChip>
          <ScopeChip
            active={scope === "unassigned"}
            onClick={() => setScope("unassigned")}
            label="Unassigned"
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
          title="Filter to My Day"
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, firm, project, client…"
          className="h-7 ml-auto w-full sm:w-[260px] rounded-md border bg-background px-2.5 text-xs focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {filtered.length} task{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {mode === "compact" ? (
          <TodosSplitBody
            scope={scope}
            setScope={setScope}
            myDayOnly={myDayOnly}
            setMyDayOnly={setMyDayOnly}
            search={search}
            extra={extra}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <TodosTableBody scope={scope} myDayOnly={myDayOnly} search={search} extra={extra} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative px-3 pb-2 pt-1 text-sm font-medium transition-colors focus-visible:outline-none",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden />
      )}
    </button>
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
