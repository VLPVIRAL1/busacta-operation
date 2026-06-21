import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday as dfnsIsToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Plus,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { cn } from "@/lib/shared/utils";
import { toast } from "sonner";
import {
  timesheetQuery,
  addReminderShare,
  searchProfilesForMention,
  type TimesheetEntry,
  type MentionProfile,
} from "@/lib/queries/global-dashboard.queries";
import { ReminderComposer, type ComposerPayload } from "./reminder-composer";
import { ReminderRichBody } from "./reminder-rich";
import { PeopleTagPopover } from "./people-tag-popover";

type DayItems = {
  notes: { id: string; title: string; color: string | null }[];
  reminders: {
    id: string;
    body: string;
    body_rich: unknown | null;
    remind_at: string;
    completed_at: string | null;
  }[];
  tasks: { id: string; title: string; display_id: string | null; status: string }[];
};

function monthKey(d: Date) {
  return format(d, "yyyy-MM");
}
function iso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function TabCalendar() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const today = new Date();
  const [month, setMonth] = useState<Date>(startOfMonth(today));
  const [selected, setSelected] = useState<Date>(today);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const mKey = monthKey(monthStart);

  // ---- Queries for the displayed month ------------------------------------
  const { data: notes = [] } = useQuery({
    queryKey: ["calendar-tab", "notes", userId, mKey],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_notes")
        .select("id, title, note_date, color")
        .eq("owner_id", userId)
        .gte("note_date", iso(monthStart))
        .lte("note_date", iso(monthEnd))
        .order("updated_at", { ascending: false });
      return (data ?? []) as {
        id: string;
        title: string;
        note_date: string;
        color: string | null;
      }[];
    },
  });

  const { data: reminders = [] } = useQuery({
    queryKey: ["calendar-tab", "reminders", userId, mKey],
    enabled: !!userId,
    queryFn: async () => {
      const start = `${iso(monthStart)}T00:00:00`;
      const end = `${iso(monthEnd)}T23:59:59`;
      const { data } = await supabase
        .from("personal_reminders")
        .select("id, body, body_rich, remind_at, completed_at")
        .eq("user_id", userId)
        .gte("remind_at", start)
        .lte("remind_at", end);
      return (
        (data ?? []) as unknown as {
          id: string;
          body: string;
          body_rich: unknown | null;
          remind_at: string;
          completed_at: string | null;
        }[]
      ).filter((r) => !!r.remind_at);
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["calendar-tab", "tasks", userId, mKey],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, display_id, status, due_date")
        .eq("assignee_id", userId)
        .gte("due_date", iso(monthStart))
        .lte("due_date", iso(monthEnd));
      return (data ?? []) as {
        id: string;
        title: string;
        display_id: string | null;
        status: string;
        due_date: string;
      }[];
    },
  });

  // ---- Index by day --------------------------------------------------------
  const byDay = useMemo(() => {
    const m = new Map<string, DayItems>();
    const ensure = (k: string) =>
      m.get(k) ?? (m.set(k, { notes: [], reminders: [], tasks: [] }).get(k) as DayItems);
    for (const n of notes)
      ensure(n.note_date).notes.push({ id: n.id, title: n.title, color: n.color });
    for (const r of reminders) ensure(r.remind_at.slice(0, 10)).reminders.push(r);
    for (const t of tasks)
      ensure(t.due_date).tasks.push({
        id: t.id,
        title: t.title,
        display_id: t.display_id,
        status: t.status,
      });
    return m;
  }, [notes, reminders, tasks]);

  const selectedKey = iso(selected);
  const selectedItems: DayItems = byDay.get(selectedKey) ?? { notes: [], reminders: [], tasks: [] };

  // ---- Mutations -----------------------------------------------------------
  const invalidateMonth = () => {
    qc.invalidateQueries({ queryKey: ["calendar-tab", "notes", userId, mKey] });
    qc.invalidateQueries({ queryKey: ["calendar-tab", "reminders", userId, mKey] });
    qc.invalidateQueries({ queryKey: ["calendar-tab", "tasks", userId, mKey] });
  };

  const addReminder = useMutation({
    mutationFn: async (p: ComposerPayload) => {
      // `remind_at` already includes the user-picked date+time from the composer.
      const payload: Record<string, unknown> = {
        user_id: userId,
        body: p.body,
        body_rich: p.bodyRich,
        remind_at: p.remindAt ?? new Date(selected).toISOString(),
      };
      if (p.color !== "default") payload.color = p.color;
      if (p.priority !== "normal") payload.priority = p.priority;
      if (p.recurrence) payload.recurrence = p.recurrence;
      let res = await supabase
        .from("personal_reminders")
        .insert(payload as never)
        .select("id")
        .single();
      if (res.error && /does not exist/i.test(res.error.message)) {
        res = await supabase
          .from("personal_reminders")
          .insert({ user_id: userId, body: p.body, remind_at: payload.remind_at } as never)
          .select("id")
          .single();
      }
      if (res.error) throw res.error;
      const newId = (res.data as { id: string }).id;
      const recipients = p.shareWith.filter((id) => id !== userId);
      if (recipients.length) {
        await Promise.all(recipients.map((id) => addReminderShare(newId, id, userId)));
      }
    },
    onSuccess: invalidateMonth,
    onError: (e) => toast.error("Failed to add reminder", { description: (e as Error).message }),
  });

  const toggleReminder = useMutation({
    mutationFn: async (vars: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("personal_reminders")
        .update({ completed_at: vars.completed ? new Date().toISOString() : null } as never)
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: invalidateMonth,
  });

  const deleteReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personal_reminders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateMonth,
  });

  const createNote = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("daily_notes")
        .insert({
          owner_id: userId,
          note_date: selectedKey,
          title: `Note — ${format(selected, "MMM d, yyyy")}`,
          content_json: { type: "doc", content: [{ type: "paragraph" }] } as never,
          updated_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      invalidateMonth();
      toast.success("Note created");
    },
    onError: (e) => toast.error("Failed to create note", { description: (e as Error).message }),
  });

  /** Move an existing note from another day to the selected day. */
  const linkNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from("daily_notes")
        .update({ note_date: selectedKey, updated_by: userId } as never)
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-tab"] });
      qc.invalidateQueries({ queryKey: ["global-dashboard", "notes-by-month"] });
      toast.success("Note linked to this day");
    },
    onError: (e) => toast.error("Failed to link note", { description: (e as Error).message }),
  });

  /** Set or update due_date on a task picked from "my open tasks". */
  const linkTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ due_date: selectedKey } as never)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-tab"] });
      qc.invalidateQueries({ queryKey: ["global-dashboard", "my-tasks"] });
      toast.success("Task scheduled");
    },
    onError: (e) => toast.error("Failed to schedule task", { description: (e as Error).message }),
  });

  // ---- Layout --------------------------------------------------------------
  const left = (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Calendar card */}
      <div className="flex flex-col rounded-lg border bg-background">
        {/* Header */}
        <div className="flex items-center gap-2 border-b p-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="flex-1 text-center text-sm font-semibold">{format(month, "MMMM yyyy")}</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date();
              setMonth(startOfMonth(now));
              setSelected(now);
            }}
          >
            Today
          </Button>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Compact grid — counts only */}
        <div className="grid grid-cols-7 auto-rows-[clamp(38px,5.5vh,52px)]">
          {days.map((d) => {
            const k = iso(d);
            const items = byDay.get(k) ?? { notes: [], reminders: [], tasks: [] };
            const inMonth = isSameMonth(d, month);
            const isTd = dfnsIsToday(d);
            const isSel = isSameDay(d, selected);
            const dueCount = items.tasks.filter((t) => t.status !== "complete").length;
            const doneCount = items.tasks.filter((t) => t.status === "complete").length;
            const notesCount = items.notes.length;
            const remCount = items.reminders.length;
            const hasAny = notesCount + remCount + dueCount + doneCount > 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelected(d)}
                className={cn(
                  "group relative flex flex-col items-center gap-0.5 border-b border-r px-1 pt-0.5 pb-1 text-xs transition-colors",
                  !inMonth && "bg-muted/30 text-muted-foreground/50",
                  inMonth && !isSel && "hover:bg-accent/40",
                  isSel && "bg-primary/10 ring-2 ring-inset ring-primary",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    isTd && "bg-primary text-primary-foreground",
                    !isTd && isSel && "text-primary",
                  )}
                >
                  {format(d, "d")}
                </span>
                {hasAny && (
                  <div className="mt-auto flex flex-wrap items-center justify-center gap-0.5">
                    {notesCount > 0 && (
                      <span
                        className="rounded bg-sky-500/15 px-1 text-[9px] font-semibold tabular-nums text-sky-700 dark:text-sky-300"
                        title={`${notesCount} note${notesCount === 1 ? "" : "s"}`}
                      >
                        {notesCount}
                      </span>
                    )}
                    {remCount > 0 && (
                      <span
                        className="rounded bg-amber-500/15 px-1 text-[9px] font-semibold tabular-nums text-amber-700 dark:text-amber-300"
                        title={`${remCount} reminder${remCount === 1 ? "" : "s"}`}
                      >
                        {remCount}
                      </span>
                    )}
                    {dueCount > 0 && (
                      <span
                        className="rounded bg-violet-500/15 px-1 text-[9px] font-semibold tabular-nums text-violet-700 dark:text-violet-300"
                        title={`${dueCount} task${dueCount === 1 ? "" : "s"} due`}
                      >
                        {dueCount}
                      </span>
                    )}
                    {doneCount > 0 && (
                      <span
                        className="rounded bg-emerald-500/15 px-1 text-[9px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300"
                        title={`${doneCount} task${doneCount === 1 ? "" : "s"} completed`}
                      >
                        {doneCount}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-2 border-t px-2 py-1 text-[10px] text-muted-foreground">
          <LegendDot className="bg-sky-500/15 text-sky-700 dark:text-sky-300" label="Notes" />
          <LegendDot
            className="bg-amber-500/15 text-amber-700 dark:text-amber-300"
            label="Reminders"
          />
          <LegendDot
            className="bg-violet-500/15 text-violet-700 dark:text-violet-300"
            label="Due"
          />
          <LegendDot
            className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            label="Done"
          />
        </div>
      </div>

      {/* Timesheet for selected day */}
      <DayTimesheet userId={userId} dateISO={selectedKey} />
    </div>
  );

  const right = (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b p-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {format(selected, "EEEE")}
          </p>
          <h2 className="text-lg font-semibold leading-tight">
            {format(selected, "MMMM d, yyyy")}
          </h2>
        </div>
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-3">
          {/* Notes */}
          <DaySection
            title="Notes"
            icon={<FileText className="h-3.5 w-3.5 text-sky-600" />}
            count={selectedItems.notes.length}
            actions={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() => createNote.mutate()}
                  disabled={createNote.isPending}
                >
                  <Plus className="h-3 w-3" /> New
                </Button>
                <NotePicker
                  userId={userId}
                  excludeDate={selectedKey}
                  onPick={(id) => linkNote.mutate(id)}
                />
              </>
            }
          >
            {selectedItems.notes.length === 0 ? (
              <Empty text="No notes for this day." />
            ) : (
              selectedItems.notes.map((n) => (
                <Link
                  key={n.id}
                  from="/global-dashboard"
                  to="/global-dashboard"
                  search={(prev) => ({ ...prev, tab: "notes" as const })}
                  className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <FileText className="h-3.5 w-3.5 text-sky-600" />
                  <span className="flex-1 truncate">{n.title || "Untitled"}</span>
                </Link>
              ))
            )}
          </DaySection>

          {/* Reminders */}
          <DaySection
            title="Reminders"
            icon={<Bell className="h-3.5 w-3.5 text-amber-600" />}
            count={selectedItems.reminders.length}
          >
            <div className="rounded-md border bg-card">
              <ReminderComposer
                variant="calendar"
                defaultDate={selected}
                busy={addReminder.isPending}
                onSubmit={(p) => addReminder.mutateAsync(p)}
                renderSharePicker={(value, onChange) => (
                  <PeopleTagPopover
                    value={value}
                    onChange={onChange}
                    variant="button"
                    hint="They can view & complete it"
                  />
                )}
              />
            </div>
            {selectedItems.reminders.length === 0 ? (
              <Empty text="No reminders today." />
            ) : (
              selectedItems.reminders.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "group flex items-start gap-2 rounded-md border bg-card px-2 py-1.5 text-sm",
                    r.completed_at && "opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={!!r.completed_at}
                    onChange={(e) =>
                      toggleReminder.mutate({ id: r.id, completed: e.target.checked })
                    }
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <ReminderRichBody
                      bodyRich={r.body_rich}
                      bodyText={r.body}
                      done={!!r.completed_at}
                    />
                    <div className="text-[10px] text-muted-foreground">
                      {format(parseISO(r.remind_at), "h:mm a")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteReminder.mutate(r.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Delete reminder"
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-rose-600" />
                  </button>
                </div>
              ))
            )}
          </DaySection>

          {/* Tasks — split into Due and Completed */}
          {(() => {
            const openTasks = selectedItems.tasks.filter((t) => t.status !== "complete");
            const doneTasks = selectedItems.tasks.filter((t) => t.status === "complete");
            const renderTask = (t: (typeof selectedItems.tasks)[number]) => (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate({ to: "/ops/tasks/$taskId", params: { taskId: t.id } })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-sm hover:bg-accent",
                  t.status === "complete" && "line-through opacity-60",
                )}
              >
                <CheckSquare
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    t.status === "complete" ? "text-emerald-600" : "text-violet-600",
                  )}
                />
                <span className="flex-1 truncate">
                  {t.display_id && (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {t.display_id} ·{" "}
                    </span>
                  )}
                  {t.title}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {t.status.replace(/_/g, " ")}
                </span>
              </button>
            );
            return (
              <section>
                <div className="mb-1.5 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <CheckSquare className="h-3.5 w-3.5 text-violet-600" />
                    Tasks
                    <span className="rounded-full bg-violet-500/15 px-1.5 text-[10px] text-violet-700 dark:text-violet-300">
                      {openTasks.length} due
                    </span>
                    <span className="rounded-full bg-emerald-500/15 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                      {doneTasks.length} done
                    </span>
                  </h3>
                  <div className="flex items-center gap-1">
                    <TaskPicker userId={userId} onPick={(id) => linkTask.mutate(id)} />
                  </div>
                </div>
                {selectedItems.tasks.length === 0 ? (
                  <Empty text="No tasks scheduled today." />
                ) : (
                  <div className="space-y-2">
                    {openTasks.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700/80 dark:text-violet-300/80">
                          Due
                        </p>
                        {openTasks.map(renderTask)}
                      </div>
                    )}
                    {doneTasks.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300/80">
                          Completed
                        </p>
                        {doneTasks.map(renderTask)}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })()}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <ResizableTwoPane
      storageKey="global-calendar-split"
      defaultLeft={50}
      minLeft={38}
      maxLeft={65}
      hideToolbar
      left={left}
      right={right}
    />
  );
}

// -----------------------------------------------------------------------------

function fmtMinutes(m: number | null): string {
  if (!m) return "—";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-2 w-2 rounded-sm", className)} />
      {label}
    </span>
  );
}

function DayTimesheet({ userId, dateISO }: { userId: string; dateISO: string }) {
  const { data: entries = [], isLoading } = useQuery(timesheetQuery(userId, dateISO));
  const totalMinutes = entries
    .filter((e) => e.kind === "time_log")
    .reduce((acc, e) => acc + (e.duration_minutes ?? 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-background">
      <header className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold">
            Timesheet · {format(parseISO(dateISO), "MMM d")}
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {entries.length} event{entries.length === 1 ? "" : "s"}
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-600"
          title="Total time tracked"
        >
          <Clock className="h-3 w-3" />
          {fmtMinutes(totalMinutes)}
        </span>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {isLoading ? (
            <p className="px-1 py-1 text-[11px] italic text-muted-foreground/60">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="px-1 py-1 text-[11px] italic text-muted-foreground/60">
              No activity recorded for this day.
            </p>
          ) : (
            <ol className="relative space-y-2 border-l border-border pl-4">
              {entries.map((e) => (
                <DayTimelineRow key={`${e.kind}-${e.id}`} entry={e} />
              ))}
            </ol>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

const ATTENDANCE_STATUS_COLORS: Record<string, string> = {
  present: "bg-emerald-500/10 text-emerald-700",
  late: "bg-amber-500/10 text-amber-700",
  absent: "bg-red-500/10 text-red-700",
  half_day: "bg-blue-500/10 text-blue-700",
};

function DayTimelineRow({ entry }: { entry: TimesheetEntry }) {
  if (entry.kind === "attendance") {
    const statusColor =
      ATTENDANCE_STATUS_COLORS[entry.attendance_status ?? ""] ?? "bg-muted text-muted-foreground";
    return (
      <li className="relative">
        <span className="absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-600">
          <UserCheck className="h-2.5 w-2.5" />
        </span>
        <div className="rounded-md border bg-card px-2 py-1.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold">Attendance</span>
            {entry.attendance_status && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                  statusColor,
                )}
              >
                {entry.attendance_status.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span>{entry.check_in ? format(parseISO(entry.check_in), "h:mm a") : "—"}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
            <span>{entry.check_out ? format(parseISO(entry.check_out), "h:mm a") : "—"}</span>
          </div>
          {entry.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.note}</p>}
        </div>
      </li>
    );
  }

  const isLog = entry.kind === "time_log";
  const Icon = isLog ? Clock : Activity;
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full border",
          isLog
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
            : "border-blue-500/40 bg-blue-500/10 text-blue-600",
        )}
      >
        <Icon className="h-2.5 w-2.5" />
      </span>
      <div className="rounded-md border bg-card px-2 py-1 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            {format(parseISO(entry.at), "h:mm a")}
          </span>
          {isLog && (
            <span className="text-[11px] font-semibold tabular-nums">
              {fmtMinutes(entry.duration_minutes)}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs">
          {entry.task_id ? (
            <Link
              to="/ops/tasks/$taskId"
              params={{ taskId: entry.task_id }}
              className="inline-flex items-center gap-1 font-medium hover:underline"
            >
              {entry.task_display_id && (
                <span className="text-[10px] text-muted-foreground">{entry.task_display_id}</span>
              )}
              <span className="truncate">{entry.task_title ?? "Untitled task"}</span>
              <ExternalLink className="h-2.5 w-2.5 opacity-50" />
            </Link>
          ) : (
            <span className="italic text-muted-foreground">No task</span>
          )}
          {!isLog && entry.event_type && (
            <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] capitalize">
              {entry.event_type.replace(/_/g, " ")}
            </span>
          )}
        </div>
        {entry.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.note}</p>}
      </div>
    </li>
  );
}

function DaySection({
  title,
  icon,
  count,
  actions,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {title}
          {count > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-foreground/70">
              {count}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-1 py-1 text-[11px] italic text-muted-foreground/60">{text}</p>;
}

function NotePicker({
  userId,
  excludeDate,
  onPick,
}: {
  userId: string;
  excludeDate: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: results = [] } = useQuery({
    queryKey: ["calendar-tab", "note-picker", userId, q],
    enabled: open && !!userId,
    queryFn: async () => {
      let query = supabase
        .from("daily_notes")
        .select("id, title, note_date")
        .eq("owner_id", userId)
        .neq("note_date", excludeDate)
        .order("updated_at", { ascending: false })
        .limit(15);
      if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);
      const { data } = await query;
      return (data ?? []) as { id: string; title: string; note_date: string }[];
    },
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" title="Link existing note">
          <LinkIcon className="h-3 w-3" /> Link
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <ul className="mt-2 max-h-60 space-y-0.5 overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-1 py-2 text-[11px] italic text-muted-foreground">No matches</li>
          ) : (
            results.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(n.id);
                    setOpen(false);
                  }}
                  className="w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <div className="truncate font-medium">{n.title || "Untitled"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Currently on {format(parseISO(n.note_date), "MMM d, yyyy")}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function TaskPicker({ userId, onPick }: { userId: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: results = [] } = useQuery({
    queryKey: ["calendar-tab", "task-picker", userId, q],
    enabled: open && !!userId,
    queryFn: async () => {
      let query = supabase
        .from("tasks")
        .select("id, title, display_id, due_date")
        .eq("assignee_id", userId)
        .neq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(20);
      if (q.trim()) query = query.or(`title.ilike.%${q.trim()}%,display_id.ilike.%${q.trim()}%`);
      const { data } = await query;
      return (data ?? []) as {
        id: string;
        title: string;
        display_id: string | null;
        due_date: string | null;
      }[];
    },
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          title="Schedule task on this day"
        >
          <Plus className="h-3 w-3" /> Add task
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="end">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your open tasks…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <ul className="mt-2 max-h-60 space-y-0.5 overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-1 py-2 text-[11px] italic text-muted-foreground">
              No open tasks match
            </li>
          ) : (
            results.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(t.id);
                    setOpen(false);
                  }}
                  className="w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <div className="truncate font-medium">
                    {t.display_id ? `${t.display_id} · ` : ""}
                    {t.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {t.due_date
                      ? `Currently due ${format(parseISO(t.due_date), "MMM d")}`
                      : "No due date"}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
