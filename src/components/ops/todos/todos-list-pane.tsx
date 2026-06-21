import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Search, Sun, AlertCircle, FolderKanban, ListTodo, GripVertical } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { FirmCode, ProjectCode, DirectClientCode } from "@/components/shared/entity-code";
import { cn } from "@/lib/shared/utils";

import { useAuth } from "@/lib/auth/auth-context";
import {
  todosQuery,
  myDayActiveQuery,
  reorderTasks,
  type TodoRow,
} from "@/lib/queries/ops.queries";
import { EMPTY_TODOS_EXTRA, type TodosExtraFilters } from "./todos-filter-bar";
import { istDayStart, istDayEnd, istWeekEnd } from "@/lib/ops/date-buckets";

export type TodosScope = "mine" | "all" | "unassigned";

export interface TodosListPaneHandle {
  focusSearch: () => void;
  moveTaskFocus: (dir: 1 | -1) => void;
  getVisibleIds: () => string[];
}

interface Props {
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  scope: TodosScope;
  myDayOnly: boolean;
  search: string;
  onSearchChange: (q: string) => void;
  extra?: TodosExtraFilters;
}

/**
 * Communication-Hub-style task list. Toolbar (scope chips, My Day, counts)
 * lives in the page shell now; this component owns the search input + list.
 */
export const TodosListPane = forwardRef<TodosListPaneHandle, Props>(function TodosListPane(
  { selectedId, onSelect, scope, myDayOnly, search, onSearchChange, extra },
  ref,
) {
  const ex = extra ?? EMPTY_TODOS_EXTRA;
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const todosKey = useMemo(() => ["todos", user?.id, role], [user?.id, role]);
  const { data: rows = [], isLoading } = useQuery(todosQuery(user?.id, role));
  const { data: myDayRows = [] } = useQuery(myDayActiveQuery(user?.id));
  const myDaySet = useMemo(() => new Set(myDayRows.map((r) => r.task_id)), [myDayRows]);

  const searchRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Persist a drag-reorder within a single Firm/Project group. We renumber the
  // whole group sequentially so positions stay dense and stable.
  const reorder = useMutation({
    mutationFn: (ordered: TodoRow[]) =>
      reorderTasks(ordered.map((r, i) => ({ id: r.id, sort_order: i + 1 }))),
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey: todosKey });
      const prev = queryClient.getQueryData<TodoRow[]>(todosKey);
      const orderById = new Map(ordered.map((r, i) => [r.id, i + 1]));
      queryClient.setQueryData<TodoRow[]>(todosKey, (cur) =>
        (cur ?? []).map((r) =>
          orderById.has(r.id) ? { ...r, sort_order: orderById.get(r.id)! } : r,
        ),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(todosKey, ctx.prev);
      toast.error(`Reorder failed: ${e.message}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startToday = istDayStart();
    const endToday = istDayEnd();
    const endWeek = istWeekEnd();
    return rows.filter((r) => {
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
        const firm =
          r.stream === "direct"
            ? (r.direct_clients?.display_name ?? "")
            : (r.client_entities?.projects?.firms?.name ?? "");
        const project = r.client_entities?.projects?.name ?? "";
        const client = r.client_entities?.name ?? "";
        const hay = `${r.title} ${r.display_id ?? ""} ${firm} ${project} ${client}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Extra filters
      if (ex.streams?.length && !ex.streams.includes(r.stream as "cpa" | "direct")) return false;
      if (ex.stageHeads.length) {
        const head = r.project_pipeline_stages?.primary_state;
        if (!head || !ex.stageHeads.includes(head)) return false;
      }
      if (ex.priorities.length && !ex.priorities.includes(r.priority)) return false;
      if (ex.complexities.length && !ex.complexities.includes(r.complexity)) return false;
      // ex.statuses is deprecated — kept on the type for backwards-compat with
      // older saved Quick Views but no longer applied as a filter.
      if (ex.firmIds.length) {
        if (r.stream === "direct") {
          if (!r.direct_client_id || !ex.firmIds.includes(r.direct_client_id)) return false;
        } else {
          const fid = r.client_entities?.projects?.firm_id;
          if (!fid || !ex.firmIds.includes(fid)) return false;
        }
      }
      if (ex.projectIds.length) {
        const pid = r.project_id;
        if (!pid || !ex.projectIds.includes(pid)) return false;
      }
      if (ex.assigneeIds.length) {
        const set = new Set(ex.assigneeIds);
        const matches =
          (r.assignee_id && set.has(r.assignee_id)) ||
          (r.task_assignees ?? []).some((p) => set.has(p.user_id));
        if (!matches) return false;
      }
      if (ex.due !== "any") {
        const dueStr = r.due_date;
        if (ex.due === "no_date") {
          if (dueStr != null) return false;
        } else {
          if (dueStr == null) return false;
          const t = new Date(dueStr).getTime();
          if (ex.due === "overdue" && !(t < startToday && r.status !== "done")) return false;
          if (ex.due === "today" && !(t >= startToday && t < endToday)) return false;
          if (ex.due === "this_week" && !(t >= startToday && t < endWeek)) return false;
        }
      }
      return true;
    });
  }, [rows, scope, user, myDayOnly, myDaySet, search, ex]);

  // Group by project so users get the same Firm/Project/Task color legend
  // as the Open Points hierarchy tree.
  const groups = useMemo(() => {
    const buckets = new Map<
      string,
      {
        firm: string;
        firmCode: string | null;
        project: string;
        projectCode: string | null;
        items: TodoRow[];
        isDirect: boolean;
      }
    >();
    for (const r of filtered) {
      // Direct-stream tasks have no project hierarchy — group under the client name.
      const isDirect = r.stream === "direct";
      const project = isDirect ? "" : (r.client_entities?.projects?.name ?? "—");
      const projectCode = isDirect ? null : (r.client_entities?.projects?.code ?? null);
      const firm = isDirect
        ? (r.direct_clients?.display_name ?? "—")
        : (r.client_entities?.projects?.firms?.name ?? "—");
      const firmCode = isDirect
        ? (r.direct_clients?.client_code ?? null)
        : (r.client_entities?.projects?.firms?.firm_identifier ?? null);
      const key = `${firm}::${project}`;
      const b = buckets.get(key) ?? { firm, firmCode, project, projectCode, items: [], isDirect };
      b.items.push(r);
      buckets.set(key, b);
    }
    // Within each group, honor the user's manual order first (sort_order, nulls
    // last). Equal/unordered rows keep the query order (due_date, created_at) —
    // Array.prototype.sort is stable, so the fallback comes for free.
    for (const b of buckets.values()) {
      b.items.sort(
        (x, y) =>
          (x.sort_order ?? Number.MAX_SAFE_INTEGER) - (y.sort_order ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return Array.from(buckets.values()).sort(
      (a, b) => a.firm.localeCompare(b.firm) || a.project.localeCompare(b.project),
    );
  }, [filtered]);

  useImperativeHandle(
    ref,
    () => ({
      focusSearch: () => searchRef.current?.focus(),
      moveTaskFocus: (dir) => {
        if (filtered.length === 0) return;
        const idx = selectedId ? filtered.findIndex((r) => r.id === selectedId) : -1;
        const next =
          idx < 0
            ? dir === 1
              ? 0
              : filtered.length - 1
            : (idx + dir + filtered.length) % filtered.length;
        onSelect(filtered[next].id);
      },
      getVisibleIds: () => filtered.map((r) => r.id),
    }),
    [filtered, selectedId, onSelect],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-background/95 backdrop-blur px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks, firms, projects… (press /)"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground tabular-nums text-right">
          {filtered.length} task{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<AlertCircle className="h-7 w-7" />}
            title="No tasks"
            description="Try a different scope or clear the search."
          />
        ) : (
          groups.map((g) => (
            <div key={`${g.firm}::${g.project}`} className="space-y-1">
              <div className="flex items-center gap-1.5 px-1.5 py-1 sticky top-0 z-[1] bg-background/95 backdrop-blur rounded">
                <FolderKanban className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                {g.isDirect ? (
                  <DirectClientCode code={g.firmCode} name={g.firm} />
                ) : (
                  <>
                    <FirmCode code={g.firmCode} name={g.firm} />
                    <ProjectCode code={g.projectCode} name={g.project} />
                  </>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                  {g.items.length}
                </span>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e: DragEndEvent) => {
                  const { active, over } = e;
                  if (!over || active.id === over.id) return;
                  const from = g.items.findIndex((r) => r.id === active.id);
                  const to = g.items.findIndex((r) => r.id === over.id);
                  if (from < 0 || to < 0) return;
                  reorder.mutate(arrayMove(g.items, from, to));
                }}
              >
                <SortableContext
                  items={g.items.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {g.items.map((r) => (
                      <TaskRow
                        key={r.id}
                        row={r}
                        selected={r.id === selectedId}
                        onSelect={() => onSelect(r.id)}
                        inMyDay={myDaySet.has(r.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

function TaskRow({
  row,
  selected,
  onSelect,
  inMyDay,
}: {
  row: TodoRow;
  selected: boolean;
  onSelect: () => void;
  inMyDay: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const subtasks = row.task_subtasks ?? [];
  const total = subtasks.length;
  const done = subtasks.filter((s) => s.is_done).length;

  const due = row.due_date ? new Date(row.due_date) : null;
  const overdue = !!due && due.getTime() < Date.now();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-stretch rounded-md border-l-2 border-transparent transition-colors",
        "border-y border-r border-transparent hover:bg-violet-500/5",
        selected
          ? "bg-violet-500/10 border-l-violet-400/60 border-y-violet-500/30 border-r-violet-500/30"
          : "border-l-violet-400/30",
        isDragging && "opacity-60 ring-1 ring-violet-400/50 bg-background shadow-sm",
      )}
    >
      <button
        type="button"
        className="shrink-0 grid place-items-center px-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground opacity-30 group-hover:opacity-100 touch-none"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        data-todo-task-id={row.id}
        onClick={onSelect}
        className="min-w-0 flex-1 text-left pr-2.5 py-2"
      >
        <div className="flex items-start gap-1.5">
          <ListTodo className="h-3 w-3 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
          {row.display_id && (
            <span className="text-[10px] font-mono text-muted-foreground tabular-nums mt-0.5">
              {row.display_id}
            </span>
          )}
          <span className="text-xs font-medium flex-1 whitespace-normal break-words">
            {row.title}
          </span>
          {inMyDay && <Sun className="h-3 w-3 text-amber-500 fill-amber-300 shrink-0 mt-0.5" />}
        </div>
        <div className="mt-1 flex items-center gap-2">
          {total > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[9px] gap-1">
              {done}/{total} Sub-tasks
            </Badge>
          )}
          <span
            className={cn(
              "ml-auto text-[10px] tabular-nums shrink-0",
              overdue ? "text-destructive font-medium" : "text-muted-foreground",
            )}
          >
            {due ? due.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
          </span>
        </div>
      </button>
    </div>
  );
}
