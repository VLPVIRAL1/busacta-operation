import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Plus,
  Bell,
  X,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";
import { BlockShell } from "./block-shell";

type Event = { id: string; title: string; time?: string | null };

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Month calendar with per-day events plus read-only overlays for BusAcTa
 * tasks due in the month and personal reminders scheduled in the month.
 */
export const CalendarBlock = Node.create({
  name: "calendarBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      month: { default: format(startOfMonth(new Date()), "yyyy-MM") },
      selected: { default: null as string | null },
      // Map of YYYY-MM-DD -> Event[]
      events: { default: {} as Record<string, Event[]> },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="calendar-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "calendar-block" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalendarView) as any;
  },
});

type LinkedTask = { id: string; title: string; display_id: string | null; due_date: string };
type LinkedReminder = { id: string; body: string; remind_at: string };
type LinkedNote = { id: string; title: string; note_date: string; color: string | null };

function CalendarView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const editable = editor.isEditable;
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const monthStr: string =
    (node.attrs.month as string) ?? format(startOfMonth(new Date()), "yyyy-MM");
  const selectedStr = (node.attrs.selected as string | null) ?? null;
  const events: Record<string, Event[]> = (node.attrs.events as Record<string, Event[]>) ?? {};
  const month = parseISO(`${monthStr}-01`);
  const selected = selectedStr ? parseISO(selectedStr) : null;
  const today = new Date();

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  // Fetch tasks + reminders for the displayed month.
  const monthKey = format(monthStart, "yyyy-MM");
  const { data: linkedTasks = [] } = useQuery({
    queryKey: ["calendar-block", "tasks", userId, monthKey],
    enabled: !!userId,
    queryFn: async (): Promise<LinkedTask[]> => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, display_id, due_date")
        .eq("assignee_id", userId)
        .gte("due_date", format(monthStart, "yyyy-MM-dd"))
        .lte("due_date", format(monthEnd, "yyyy-MM-dd"))
        .neq("status", "complete");
      return ((data ?? []) as LinkedTask[]).filter((t) => !!t.due_date);
    },
  });

  const { data: linkedReminders = [] } = useQuery({
    queryKey: ["calendar-block", "reminders", userId, monthKey],
    enabled: !!userId,
    queryFn: async (): Promise<LinkedReminder[]> => {
      const start = `${format(monthStart, "yyyy-MM-dd")}T00:00:00`;
      const end = `${format(monthEnd, "yyyy-MM-dd")}T23:59:59`;
      const { data } = await supabase
        .from("personal_reminders")
        .select("id, body, remind_at")
        .eq("user_id", userId)
        .is("completed_at", null)
        .gte("remind_at", start)
        .lte("remind_at", end);
      return ((data ?? []) as LinkedReminder[]).filter((r) => !!r.remind_at);
    },
  });

  const { data: linkedNotes = [] } = useQuery({
    queryKey: ["calendar-block", "notes", userId, monthKey],
    enabled: !!userId,
    queryFn: async (): Promise<LinkedNote[]> => {
      const { data } = await supabase
        .from("daily_notes")
        .select("id, title, note_date, color")
        .eq("owner_id", userId)
        .gte("note_date", format(monthStart, "yyyy-MM-dd"))
        .lte("note_date", format(monthEnd, "yyyy-MM-dd"));
      return ((data ?? []) as LinkedNote[]).filter((n) => !!n.note_date);
    },
  });

  // Index linked items by YYYY-MM-DD for quick day-cell + selected-day lookup.
  const tasksByDay = useMemo(() => {
    const m = new Map<string, LinkedTask[]>();
    for (const t of linkedTasks) {
      const k = t.due_date;
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    return m;
  }, [linkedTasks]);
  const remindersByDay = useMemo(() => {
    const m = new Map<string, LinkedReminder[]>();
    for (const r of linkedReminders) {
      const k = r.remind_at.slice(0, 10);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  }, [linkedReminders]);
  const notesByDay = useMemo(() => {
    const m = new Map<string, LinkedNote[]>();
    for (const n of linkedNotes) {
      const arr = m.get(n.note_date) ?? [];
      arr.push(n);
      m.set(n.note_date, arr);
    }
    return m;
  }, [linkedNotes]);

  function shift(n: number) {
    updateAttributes({ month: format(startOfMonth(addMonths(month, n)), "yyyy-MM") });
  }

  function addEvent(dateISO: string, title: string, time?: string) {
    const list = events[dateISO] ?? [];
    const next = { ...events, [dateISO]: [...list, { id: uid("evt"), title, time: time || null }] };
    updateAttributes({ events: next });
  }
  function removeEvent(dateISO: string, eventId: string) {
    const list = events[dateISO] ?? [];
    const filtered = list.filter((e) => e.id !== eventId);
    const next = { ...events };
    if (filtered.length === 0) delete next[dateISO];
    else next[dateISO] = filtered;
    updateAttributes({ events: next });
  }

  const selectedISO = selected ? format(selected, "yyyy-MM-dd") : null;
  const selectedEvents = selectedISO ? (events[selectedISO] ?? []) : [];
  const selectedTasks = selectedISO ? (tasksByDay.get(selectedISO) ?? []) : [];
  const selectedReminders = selectedISO ? (remindersByDay.get(selectedISO) ?? []) : [];
  const selectedNotes = selectedISO ? (notesByDay.get(selectedISO) ?? []) : [];

  // When no date is picked, the right pane shows everything in the month
  // grouped by day, so the block is useful at a glance.
  const monthGrouped = useMemo(() => {
    const keys = new Set<string>();
    Object.keys(events).forEach((k) => keys.add(k));
    tasksByDay.forEach((_v, k) => keys.add(k));
    remindersByDay.forEach((_v, k) => keys.add(k));
    notesByDay.forEach((_v, k) => keys.add(k));
    return Array.from(keys)
      .filter((k) => k >= format(monthStart, "yyyy-MM-dd") && k <= format(monthEnd, "yyyy-MM-dd"))
      .sort();
  }, [events, tasksByDay, remindersByDay, notesByDay, monthStart, monthEnd]);

  return (
    <BlockShell
      icon={CalendarIcon}
      label="Calendar"
      editable={editable}
      onDelete={() => deleteNode()}
      dataType="calendar-block"
      headerExtra={
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => shift(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[110px] text-center text-xs font-semibold text-foreground">
            {format(month, "MMMM yyyy")}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => shift(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(220px,300px)_1fr]">
        {/* Left: mini calendar */}
        <div className="min-w-0">
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const iso = format(d, "yyyy-MM-dd");
              const inMonth = isSameMonth(d, month);
              const isToday = isSameDay(d, today);
              const isSel = selected && isSameDay(d, selected);
              const evCount = (events[iso] ?? []).length;
              const tCount = (tasksByDay.get(iso) ?? []).length;
              const rCount = (remindersByDay.get(iso) ?? []).length;
              const nCount = (notesByDay.get(iso) ?? []).length;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => updateAttributes({ selected: isSel ? null : iso })}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-md text-xs transition-colors",
                    !inMonth && "text-muted-foreground/40",
                    inMonth && !isToday && !isSel && "hover:bg-accent",
                    isToday && !isSel && "bg-primary text-primary-foreground font-semibold",
                    isSel && "ring-2 ring-primary",
                  )}
                >
                  <span>{format(d, "d")}</span>
                  {evCount + tCount + rCount + nCount > 0 && (
                    <span className="absolute bottom-0.5 flex items-center gap-0.5">
                      {evCount > 0 && <span className="h-1 w-1 rounded-full bg-violet-500" />}
                      {tCount > 0 && <span className="h-1 w-1 rounded-full bg-sky-500" />}
                      {rCount > 0 && <span className="h-1 w-1 rounded-full bg-amber-500" />}
                      {nCount > 0 && <span className="h-1 w-1 rounded-full bg-emerald-500" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Events
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Tasks
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Reminders
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Notes
            </span>
          </div>
        </div>

        {/* Right: day details (selected day) OR month overview (default) */}
        <div className="min-w-0">
          {selectedISO ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {format(parseISO(selectedISO), "EEEE, MMM d")}
                </p>
                <button
                  type="button"
                  onClick={() => updateAttributes({ selected: null })}
                  className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  Show all
                </button>
              </div>
              <DayItems
                events={selectedEvents}
                tasks={selectedTasks}
                reminders={selectedReminders}
                notes={selectedNotes}
                editable={editable}
                onAdd={(title, time) => addEvent(selectedISO, title, time)}
                onRemove={(id) => removeEvent(selectedISO, id)}
                onOpenTask={(id) => navigate({ to: "/ops/tasks/$taskId", params: { taskId: id } })}
              />
            </>
          ) : (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                All of {format(month, "MMMM yyyy")}
              </p>
              {monthGrouped.length === 0 ? (
                <p className="px-1 py-2 text-[11px] italic text-muted-foreground/60">
                  Nothing scheduled this month.
                </p>
              ) : (
                <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                  {monthGrouped.map((iso) => (
                    <div key={iso}>
                      <button
                        type="button"
                        onClick={() => updateAttributes({ selected: iso })}
                        className="mb-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                      >
                        {format(parseISO(iso), "EEE, MMM d")}
                        {iso === format(today, "yyyy-MM-dd") && (
                          <span className="ml-1 rounded bg-primary/15 px-1 text-[10px] text-primary">
                            Today
                          </span>
                        )}
                      </button>
                      <DayItems
                        events={events[iso] ?? []}
                        tasks={tasksByDay.get(iso) ?? []}
                        reminders={remindersByDay.get(iso) ?? []}
                        notes={notesByDay.get(iso) ?? []}
                        editable={false}
                        compact
                        onAdd={() => {}}
                        onRemove={() => {}}
                        onOpenTask={(id) =>
                          navigate({ to: "/ops/tasks/$taskId", params: { taskId: id } })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </BlockShell>
  );
}

function DayItems({
  events,
  tasks,
  reminders,
  notes,
  editable,
  compact,
  onAdd,
  onRemove,
  onOpenTask,
}: {
  events: Event[];
  tasks: LinkedTask[];
  reminders: LinkedReminder[];
  notes: LinkedNote[];
  editable: boolean;
  compact?: boolean;
  onAdd: (title: string, time?: string) => void;
  onRemove: (id: string) => void;
  onOpenTask: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  return (
    <div className={cn("rounded-md border bg-background p-2", compact && "border-dashed")}>
      {events.length === 0 &&
        tasks.length === 0 &&
        reminders.length === 0 &&
        notes.length === 0 && (
          <p className="px-1 py-1 text-[11px] italic text-muted-foreground/60">
            Nothing scheduled.
          </p>
        )}

      {events.length > 0 && (
        <ul className="space-y-0.5">
          {events.map((e) => (
            <li
              key={e.id}
              className="group flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-accent"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
              {e.time && (
                <span className="inline-flex items-center gap-0.5 tabular-nums text-[10px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" /> {e.time}
                </span>
              )}
              <span className="flex-1 truncate">{e.title}</span>
              {editable && (
                <button
                  type="button"
                  onClick={() => onRemove(e.id)}
                  className="opacity-0 group-hover:opacity-100"
                  aria-label="Remove event"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-accent"
            >
              <CheckSquare className="h-3 w-3 shrink-0 text-sky-600" />
              <span className="flex-1 truncate">
                {t.display_id ? `${t.display_id} · ` : ""}
                {t.title}
              </span>
              <button
                type="button"
                onClick={() => onOpenTask(t.id)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Open task"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {reminders.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {reminders.map((r) => {
            const t = r.remind_at.slice(11, 16);
            return (
              <li
                key={r.id}
                className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-accent"
              >
                <Bell className="h-3 w-3 shrink-0 text-amber-600" />
                <span className="inline-flex items-center gap-0.5 tabular-nums text-[10px] text-muted-foreground">
                  {t}
                </span>
                <span className="flex-1 truncate">{r.body}</span>
              </li>
            );
          })}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {notes.map((n) => (
            <li
              key={n.id}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-accent"
            >
              <FileText className="h-3 w-3 shrink-0 text-emerald-600" />
              <span className="flex-1 truncate">{n.title || "Untitled"}</span>
            </li>
          ))}
        </ul>
      )}

      {editable && !compact && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = title.trim();
            if (!t) return;
            onAdd(t, time || undefined);
            setTitle("");
            setTime("");
          }}
          className="mt-2 flex items-center gap-1"
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title…"
            className="h-7 flex-1 text-xs"
          />
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-7 w-[90px] text-xs"
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Add event"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>
      )}
    </div>
  );
}
