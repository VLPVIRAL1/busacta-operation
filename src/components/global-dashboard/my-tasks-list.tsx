import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle2,
  Circle,
  Sun,
  ChevronDown,
  ChevronRight,
  ListTodo,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  myTasksQuery,
  myTasksMultiQuery,
  myDayFlagsQuery,
  taskOrderQuery,
  taskMajorHead,
  taskStageLabel,
  MAJOR_HEAD_TO_METRIC,
  type MyTaskRow,
  type DashboardMetric,
  type MajorHead,
} from "@/lib/queries/global-dashboard.queries";
import { cn } from "@/lib/shared/utils";

const ROLE_BADGE = {
  A: { label: "A", title: "Assignee", cls: "bg-blue-600 text-white" },
  R: { label: "R", title: "Reviewer", cls: "bg-amber-500 text-white" },
} as const;

// Tone per major head — the detailed stage label badge and the left accent bar
// are coloured by the head the task's pipeline stage rolls up into.
// Tints use opacity so they read correctly in both light and dark themes.
const MAJOR_HEAD_TONE: Record<MajorHead, { bar: string; badge: string }> = {
  with_bat: {
    bar: "bg-blue-500",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
  },
  with_cpa: {
    bar: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  },
  on_hold: {
    bar: "bg-rose-400",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20",
  },
  completed: {
    bar: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
  },
};

const SECTION_STYLE = {
  day: {
    header: "bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20",
    count: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    border: "border-l-2 border-amber-400",
  },
  active: {
    header: "bg-blue-500/10 text-blue-800 dark:text-blue-300 hover:bg-blue-500/20",
    count: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    border: "border-l-2 border-blue-400",
  },
  done: {
    header: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20",
    count: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    border: "border-l-2 border-emerald-400",
  },
};

export function MyTasksList({
  selectedId,
  onSelect,
  metricFilter,
  usersFilter = [],
  clientsFilter = [],
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  metricFilter?: DashboardMetric | null;
  usersFilter?: string[];
  clientsFilter?: string[];
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const qc = useQueryClient();
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState({ day: true, active: true, done: false });

  const isMultiUser = usersFilter.length > 0;
  const { data: singleTasks = [] } = useQuery({
    ...myTasksQuery(userId),
    enabled: !isMultiUser && !!userId,
  });
  const { data: multiTasks = [] } = useQuery({
    ...myTasksMultiQuery(isMultiUser ? usersFilter : []),
    enabled: isMultiUser,
  });
  const tasks: MyTaskRow[] = isMultiUser ? multiTasks : singleTasks;
  const { data: dayFlags = new Set<string>() } = useQuery(myDayFlagsQuery(userId));
  const { data: order = new Map<string, number>() } = useQuery(taskOrderQuery(userId));

  const sevenDaysAgo = useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, []);

  const { day, active, done } = useMemo(() => {
    const sorter = (a: MyTaskRow, b: MyTaskRow) => {
      const ao = order.get(a.id) ?? 9999;
      const bo = order.get(b.id) ?? 9999;
      if (ao !== bo) return ao - bo;
      return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    };
    const q = search.trim().toLowerCase();
    const filtered = (() => {
      let rows = tasks;
      if (metricFilter && metricFilter !== "total") {
        rows = rows.filter((t) => MAJOR_HEAD_TO_METRIC[taskMajorHead(t)] === metricFilter);
      }
      if (q) {
        rows = rows.filter(
          (t) => t.title?.toLowerCase().includes(q) || t.display_id?.toLowerCase().includes(q),
        );
      }
      if (clientsFilter.length) {
        const sel = new Set(clientsFilter);
        rows = rows.filter((t) => {
          const firmId = t.client_entities?.projects?.firms?.id;
          return (
            (firmId && sel.has(`firm:${firmId}`)) ||
            (t.direct_client_id && sel.has(`direct:${t.direct_client_id}`))
          );
        });
      }
      return rows;
    })();
    const day: MyTaskRow[] = [];
    const active: MyTaskRow[] = [];
    const done: MyTaskRow[] = [];
    for (const t of filtered) {
      if (t.status === "complete") {
        if (showAllCompleted) done.push(t);
        else if (t.completed_at && new Date(t.completed_at).getTime() >= sevenDaysAgo) done.push(t);
      } else if (dayFlags.has(t.id)) day.push(t);
      else active.push(t);
    }
    day.sort(sorter);
    active.sort(sorter);
    done.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    return { day, active, done };
  }, [tasks, dayFlags, order, sevenDaysAgo, showAllCompleted, metricFilter, search, clientsFilter]);

  const toggleDay = useMutation({
    mutationFn: async (taskId: string) => {
      const today = new Date().toISOString().slice(0, 10);
      if (dayFlags.has(taskId)) {
        await supabase
          .from("my_day_flags")
          .delete()
          .eq("user_id", userId)
          .eq("task_id", taskId)
          .eq("flagged_for", today);
      } else {
        await supabase
          .from("my_day_flags")
          .insert({ user_id: userId, task_id: taskId, flagged_for: today });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["global-dashboard", "my-day", userId] }),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const rows = ids.map((task_id, i) => ({ user_id: userId, task_id, sort_order: i }));
      await supabase.from("task_user_order").upsert(rows, { onConflict: "user_id,task_id" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["global-dashboard", "task-order", userId] }),
  });

  return (
    <div className="h-full min-h-0 flex flex-col rounded-lg border overflow-hidden bg-card shadow-sm">
      <aside className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b bg-gradient-to-r from-blue-500/10 to-indigo-500/10 px-3 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-300">
            <ListTodo className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            My Tasks
            {metricFilter && metricFilter !== "total" && (
              <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-blue-700 dark:text-blue-300">
                {metricFilter.replace("_", " ")}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-[11px] text-blue-600/70 dark:text-blue-400/70">
            {active.length + day.length} open · {done.length} recently done
          </p>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search task name…"
              className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-2">
          <Section
            variant="day"
            title="My Day"
            icon={Sun}
            count={day.length}
            open={openSections.day}
            onToggle={() => setOpenSections((s) => ({ ...s, day: !s.day }))}
          >
            <SortableList
              items={day}
              onReorder={(ids) => reorder.mutate(ids)}
              renderItem={(t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  userId={userId}
                  selected={selectedId === t.id}
                  onSelect={() => onSelect(t.id)}
                  isInDay={dayFlags.has(t.id)}
                  onToggleDay={() => toggleDay.mutate(t.id)}
                />
              )}
            />
          </Section>

          <Section
            variant="active"
            title="Active"
            icon={Circle}
            count={active.length}
            open={openSections.active}
            onToggle={() => setOpenSections((s) => ({ ...s, active: !s.active }))}
          >
            <SortableList
              items={active}
              onReorder={(ids) => reorder.mutate(ids)}
              renderItem={(t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  userId={userId}
                  selected={selectedId === t.id}
                  onSelect={() => onSelect(t.id)}
                  isInDay={dayFlags.has(t.id)}
                  onToggleDay={() => toggleDay.mutate(t.id)}
                />
              )}
            />
          </Section>

          <Section
            variant="done"
            title={showAllCompleted ? "All Completed" : "Recently Completed (7d)"}
            icon={CheckCircle2}
            count={done.length}
            open={openSections.done}
            onToggle={() => setOpenSections((s) => ({ ...s, done: !s.done }))}
            extra={
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAllCompleted((v) => !v);
                }}
              >
                {showAllCompleted ? "Last 7 days" : "Show all"}
              </button>
            }
          >
            <ul className="space-y-1">
              {done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  userId={userId}
                  selected={selectedId === t.id}
                  onSelect={() => onSelect(t.id)}
                  isInDay={false}
                  onToggleDay={() => toggleDay.mutate(t.id)}
                />
              ))}
            </ul>
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({
  variant,
  title,
  icon: Icon,
  count,
  open,
  onToggle,
  extra,
  children,
}: {
  variant: keyof typeof SECTION_STYLE;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  open: boolean;
  onToggle: () => void;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const s = SECTION_STYLE[variant];
  return (
    <div className={cn("rounded-md overflow-hidden", s.border)}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
          s.header,
        )}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Icon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{title}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-normal", s.count)}>
          {count}
        </span>
        {extra}
      </button>
      {open && <div className="mt-0.5 pb-1">{children}</div>}
    </div>
  );
}

function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  renderItem: (t: T) => React.ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const ids = items.map((t) => t.id);
  function handleEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(ids, oldIdx, newIdx));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1">
          {items.map((t) => (
            <SortableItem key={t.id} id={t.id}>
              {renderItem(t)}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </li>
  );
}

function TaskRow({
  task,
  userId,
  selected,
  onSelect,
  isInDay,
  onToggleDay,
}: {
  task: MyTaskRow;
  userId: string;
  selected: boolean;
  onSelect: () => void;
  isInDay: boolean;
  onToggleDay: () => void;
}) {
  const isDone = task.status === "complete";
  const majorHead = taskMajorHead(task);
  const tone = MAJOR_HEAD_TONE[majorHead];
  const stageLabel = taskStageLabel(task);

  const taskTypeLabel = task.direct_client_task_types?.label ?? null;
  const firmCode =
    task.client_entities?.projects?.firms?.firm_identifier ??
    task.client_entities?.projects?.firms?.name ??
    task.direct_clients?.display_name ??
    null;

  const isAssignee = !!userId && task.assignee_id === userId;
  const isReviewer = !!userId && task.reviewer_id === userId;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-md border px-2 py-1.5 text-sm cursor-pointer pl-3",
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-transparent hover:border-border/60 hover:bg-accent/50",
      )}
    >
      {/* Left status accent bar */}
      <span
        className={cn("absolute inset-y-2 left-1 w-[3px] rounded-full", tone.bar)}
        aria-hidden
      />

      {/* Title row: role badges + title + sun button */}
      <div className="flex items-start gap-1.5">
        {/* R / A role badges */}
        <div className="mt-0.5 flex shrink-0 gap-0.5">
          {isAssignee && (
            <span
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold leading-none",
                ROLE_BADGE.A.cls,
              )}
              title={ROLE_BADGE.A.title}
            >
              A
            </span>
          )}
          {isReviewer && (
            <span
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold leading-none",
                ROLE_BADGE.R.cls,
              )}
              title={ROLE_BADGE.R.title}
            >
              R
            </span>
          )}
        </div>

        <div
          className={cn(
            "min-w-0 flex-1 text-sm font-medium leading-snug [overflow-wrap:anywhere]",
            isDone && "line-through text-muted-foreground",
          )}
        >
          {task.title}
        </div>

        {/* Always-visible My Day sun button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDay();
          }}
          className={cn(
            "mt-0.5 shrink-0 rounded p-0.5 transition-colors",
            isInDay
              ? "text-amber-500 hover:text-amber-600"
              : "text-muted-foreground/40 hover:text-amber-400",
          )}
          aria-label={isInDay ? "Remove from My Day" : "Add to My Day"}
          title={isInDay ? "Remove from My Day" : "Add to My Day"}
        >
          <Sun className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Metadata chips row */}
      <div className="mt-1 flex flex-wrap items-center gap-1 pl-[22px]">
        {firmCode && (
          <span
            className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-blue-700 dark:text-blue-300 border border-blue-500/20"
            title="Firm / B2C Client Code"
          >
            {firmCode}
          </span>
        )}
        {stageLabel && (
          <span
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
              tone.badge,
            )}
          >
            {stageLabel}
          </span>
        )}
        {taskTypeLabel && (
          <span className="inline-flex items-center rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
            {taskTypeLabel}
          </span>
        )}
      </div>
    </div>
  );
}
