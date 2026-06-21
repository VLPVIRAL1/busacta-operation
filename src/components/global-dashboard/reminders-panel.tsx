import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Bell,
  CalendarClock,
  Check,
  Copy,
  Flag,
  Globe,
  Pencil,
  RefreshCw,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { subscribeChannel } from "@/lib/realtime/channel-registry";
import {
  remindersQuery,
  addReminderShare,
  leaveReminderShare,
  searchProfilesForMention,
  reminderPublicTokensQuery,
  createReminderPublicToken,
  revokeReminderPublicToken,
  deleteReminderPublicToken,
  type Reminder,
  type ReminderPriority,
  type ReminderRecurrence,
  type MentionProfile,
} from "@/lib/queries/global-dashboard.queries";
import { cn } from "@/lib/shared/utils";
import { toast } from "sonner";
import { NoteColorPicker } from "./note-color-picker";
import { noteColor, type NoteColorKey } from "./note-colors";
import { ReminderComposer, type ComposerPayload } from "./reminder-composer";
import { ReminderRichBody } from "./reminder-rich";
import { PeopleTagPopover } from "./people-tag-popover";

const PRIORITY_STYLE: Record<ReminderPriority, string> = {
  high: "text-rose-500 fill-rose-500/20",
  normal: "text-muted-foreground fill-transparent",
  low: "text-sky-500 fill-sky-500/10",
};
const PRIORITY_ORDER: ReminderPriority[] = ["high", "normal", "low"];

type DueState = "none" | "overdue" | "today" | "upcoming";
function dueState(remindAt: string | null, completed: boolean): DueState {
  if (!remindAt || completed) return "none";
  const d = new Date(remindAt);
  const now = new Date();
  if (d.getTime() < now.getTime()) return "overdue";
  if (d.toDateString() === now.toDateString()) return "today";
  return "upcoming";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function RemindersPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(remindersQuery(userId));

  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["global-dashboard", "reminders", userId] });

  // Realtime: reminders + share links (own and shared-with-me) can change anywhere.
  // Uses the channel registry so React StrictMode double-invoke doesn't add
  // postgres_changes listeners to an already-subscribed channel.
  useEffect(() => {
    return subscribeChannel(`reminders-shared-${userId}`, (ch) =>
      ch
        .on("postgres_changes", { event: "*", schema: "public", table: "personal_reminders" }, () =>
          invalidate(),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "reminder_shares" }, () =>
          invalidate(),
        ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const stats = useMemo(() => {
    let overdue = 0;
    let today = 0;
    for (const r of data ?? []) {
      if (r.completed_at) continue;
      const s = dueState(r.remind_at, false);
      if (s === "overdue") overdue++;
      else if (s === "today") today++;
    }
    return { overdue, today };
  }, [data]);

  const handleAdd = async (p: ComposerPayload) => {
    if (!p.body) return;
    setAdding(true);
    try {
      const basePayload: Record<string, unknown> = {
        user_id: userId,
        body: p.body,
        remind_at: p.remindAt,
      };
      const payload: Record<string, unknown> = { ...basePayload, body_rich: p.bodyRich };
      if (p.color !== "default") payload.color = p.color;
      if (p.priority !== "normal") payload.priority = p.priority;
      if (p.recurrence) payload.recurrence = p.recurrence;
      let res = await supabase
        .from("personal_reminders")
        .insert(payload as never)
        .select("id")
        .single();
      if (res.error && /does not exist/i.test(res.error.message)) {
        // body_rich / colour / priority columns not migrated yet — save the basics.
        res = await supabase
          .from("personal_reminders")
          .insert(basePayload as never)
          .select("id")
          .single();
      }
      if (res.error) throw res.error;
      const newId = (res.data as { id: string }).id;
      const recipients = p.shareWith.filter((id) => id !== userId);
      if (recipients.length) {
        await Promise.all(recipients.map((id) => addReminderShare(newId, id, userId)));
      }
      invalidate();
    } catch (e) {
      toast.error("Failed to add reminder", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setAdding(false);
    }
  };

  const patchReminder = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("personal_reminders")
      .update(patch as never)
      .eq("id", id);
    // Ignore "column does not exist" so colour/priority changes degrade quietly pre-migration.
    if (error && !/does not exist/i.test(error.message)) {
      toast.error("Failed to update reminder", { description: error.message });
    } else {
      invalidate();
    }
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    await patchReminder(id, { completed_at: completed ? new Date().toISOString() : null });
    if (!completed) return;
    // For recurring reminders, spawn the next occurrence.
    const r = (data ?? []).find((rem) => rem.id === id);
    if (!r?.recurrence || !r.is_owner) return;
    const base = r.remind_at ? new Date(r.remind_at) : new Date();
    const next = new Date(base);
    if (r.recurrence === "daily") next.setDate(next.getDate() + 1);
    else if (r.recurrence === "weekly") next.setDate(next.getDate() + 7);
    else if (r.recurrence === "monthly") next.setMonth(next.getMonth() + 1);
    const payload: Record<string, unknown> = {
      user_id: userId,
      body: r.body,
      remind_at: next.toISOString(),
      recurrence: r.recurrence,
    };
    if (r.color) payload.color = r.color;
    if (r.priority !== "normal") payload.priority = r.priority;
    try {
      await supabase.from("personal_reminders").insert(payload as never);
      invalidate();
    } catch {
      // Recurrence column not migrated yet — silently skip.
    }
  };

  const saveEdit = async (id: string) => {
    const v = editValue.trim();
    setEditingId(null);
    if (v && v !== (data ?? []).find((r) => r.id === id)?.body) {
      await patchReminder(id, { body: v });
    }
  };

  const removeOwned = async (id: string) => {
    const { error } = await supabase.from("personal_reminders").delete().eq("id", id);
    if (error) toast.error("Failed to delete reminder");
    else invalidate();
  };

  const leave = async (id: string) => {
    try {
      await leaveReminderShare(id, userId);
      invalidate();
    } catch {
      toast.error("Failed to leave reminder");
    }
  };

  const applyShares = async (reminderId: string, next: string[], old: string[]) => {
    const added = next.filter((id) => id !== userId && !old.includes(id));
    const removed = old.filter((id) => !next.includes(id));
    try {
      await Promise.all([
        ...added.map((id) => addReminderShare(reminderId, id, userId)),
        ...removed.map((id) => leaveReminderShare(reminderId, id)),
      ]);
      invalidate();
    } catch (e) {
      toast.error("Failed to update sharing", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Composer */}
      <ReminderComposer
        busy={adding}
        onSubmit={handleAdd}
        renderSharePicker={(value, onChange) => (
          <PeopleTagPopover
            value={value}
            onChange={onChange}
            variant="button"
            hint="They can view & complete it"
          />
        )}
      />

      {/* Public link manager */}
      <PublicLinkManager userId={userId} />

      {/* Due summary */}
      {(stats.overdue > 0 || stats.today > 0) && (
        <div className="flex items-center gap-3 border-b bg-background px-3 py-1.5 text-[11px] font-medium">
          {stats.overdue > 0 && (
            <span className="inline-flex items-center gap-1 text-rose-600">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              {stats.overdue} overdue
            </span>
          )}
          {stats.today > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {stats.today} due today
            </span>
          )}
        </div>
      )}

      {/* List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Bell className="h-6 w-6 opacity-50" />
            <p>No reminders yet. Add one above.</p>
          </div>
        ) : (
          <ul className="space-y-1.5 p-2">
            {data.map((r) => (
              <ReminderRow
                key={r.id}
                r={r}
                userId={userId}
                editing={editingId === r.id}
                editValue={editValue}
                onEditValueChange={setEditValue}
                onStartEdit={() => {
                  setEditingId(r.id);
                  setEditValue(r.body);
                }}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => saveEdit(r.id)}
                onToggle={(v) => toggleComplete(r.id, v)}
                onColor={(c) => patchReminder(r.id, { color: c === "default" ? null : c })}
                onPriority={(p) => patchReminder(r.id, { priority: p })}
                onRecurrence={(rec) => patchReminder(r.id, { recurrence: rec })}
                onRemindAt={(iso) => patchReminder(r.id, { remind_at: iso })}
                onDelete={() => removeOwned(r.id)}
                onLeave={() => leave(r.id)}
                onShares={(next) =>
                  applyShares(
                    r.id,
                    next,
                    r.shared_with.map((s) => s.id),
                  )
                }
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function ReminderRow({
  r,
  userId,
  editing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggle,
  onRemindAt,
  onColor,
  onPriority,
  onRecurrence,
  onDelete,
  onLeave,
  onShares,
}: {
  r: Reminder;
  userId: string;
  editing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggle: (v: boolean) => void;
  onRemindAt: (iso: string | null) => void;
  onColor: (c: NoteColorKey) => void;
  onPriority: (p: ReminderPriority) => void;
  onRecurrence: (rec: ReminderRecurrence | null) => void;
  onDelete: () => void;
  onLeave: () => void;
  onShares: (next: string[]) => void;
}) {
  const done = !!r.completed_at;
  const due = dueState(r.remind_at, done);
  const c = noteColor(r.color);
  const tinted = r.color && r.color !== "default";

  return (
    <li
      className={cn(
        "group relative flex items-start gap-2.5 overflow-hidden rounded-lg border px-3 py-2 pl-3.5 transition-colors",
        tinted ? c.tile : "border-border bg-card hover:bg-accent/40",
        done && "opacity-55",
      )}
    >
      {/* Colour accent bar */}
      <span className={cn("absolute inset-y-0 left-0 w-1", c.bar)} aria-hidden />

      <Checkbox checked={done} onCheckedChange={(v) => onToggle(!!v)} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveEdit();
              } else if (e.key === "Escape") {
                onCancelEdit();
              }
            }}
            className="h-7 text-sm"
          />
        ) : (
          <div onDoubleClick={onStartEdit} className="flex items-start gap-1">
            {r.priority === "high" && !done && (
              <Flag className="mt-0.5 h-3 w-3 shrink-0 fill-rose-500/20 text-rose-500" />
            )}
            <ReminderRichBody bodyRich={r.body_rich} bodyText={r.body} done={done} />
          </div>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {r.remind_at && (
            <span
              className={cn(
                "inline-flex items-center text-[11px]",
                due === "overdue"
                  ? "font-medium text-rose-600"
                  : due === "today"
                    ? "font-medium text-amber-600"
                    : "text-muted-foreground",
              )}
            >
              <CalendarClock className="mr-1 inline h-3 w-3" />
              {format(new Date(r.remind_at), "MMM d, h:mm a")}
              {due === "overdue" && " · overdue"}
            </span>
          )}

          {/* Shared-with-me: who shared it */}
          {!r.is_owner && r.owner_name && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <UserPlus className="h-2.5 w-2.5" /> from {r.owner_name}
            </span>
          )}

          {/* External submission badge */}
          {r.source === "public" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              <Globe className="h-2.5 w-2.5" />
              from {r.external_sender_name ?? "external"}
            </span>
          )}

          {/* Recurrence badge */}
          {r.recurrence && !done && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              <RefreshCw className="h-2.5 w-2.5" />
              {r.recurrence}
            </span>
          )}

          {/* Owned + shared: recipient chips */}
          {r.is_owner && r.shared_with.length > 0 && (
            <span className="inline-flex items-center gap-1">
              {r.shared_with.slice(0, 3).map((s) => (
                <span
                  key={s.id}
                  title={s.name}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[8px] font-semibold text-primary"
                >
                  {initials(s.name)}
                </span>
              ))}
              {r.shared_with.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{r.shared_with.length - 3}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {!editing && (
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <ReminderDateTimePicker value={r.remind_at} onChange={onRemindAt} />
        <PriorityPicker value={r.priority} onChange={onPriority} compact />
        <RecurrencePicker value={r.recurrence} onChange={onRecurrence} compact />
        <NoteColorPicker
          value={r.color}
          onChange={onColor}
          align="end"
          title="Reminder colour"
          className="h-6 w-6"
        />
        {r.is_owner ? (
          <>
            <PeopleTagPopover
              value={r.shared_with.map((s) => s.id)}
              onChange={onShares}
              variant="icon"
              align="end"
            />
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-rose-600"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onLeave}
            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-rose-600"
            title="Remove from my list"
          >
            <UserMinus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

function ReminderDateTimePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(value ? new Date(value) : undefined);
  const [time, setTime] = useState<string>(value ? format(parseISO(value), "HH:mm") : "09:00");

  useEffect(() => {
    if (value) {
      setDate(new Date(value));
      setTime(format(new Date(value), "HH:mm"));
    } else {
      setDate(undefined);
      setTime("09:00");
    }
  }, [value]);

  const apply = () => {
    if (!date) {
      onChange(null);
    } else {
      const [h, m] = time.split(":").map(Number);
      const d = new Date(date);
      d.setHours(h || 0, m || 0, 0, 0);
      onChange(d.toISOString());
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Edit date & time"
          className={cn(
            "rounded p-1 hover:bg-background",
            value
              ? "text-amber-500 hover:text-amber-600"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar mode="single" selected={date} onSelect={setDate} autoFocus />
        <div className="flex items-center gap-2 border-t px-3 py-2">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-8 flex-1 rounded border border-input bg-background px-2 text-sm tabular-nums"
          />
          <Button size="sm" className="h-8 px-3" onClick={apply}>
            Set
          </Button>
        </div>
        {value && (
          <div className="border-t px-3 pb-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="w-full text-center text-[11px] text-muted-foreground hover:text-rose-600"
            >
              Clear date
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PriorityPicker({
  value,
  onChange,
  compact,
}: {
  value: ReminderPriority;
  onChange: (p: ReminderPriority) => void;
  compact?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Priority: ${value}`}
          className={cn(
            "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            compact ? "h-6 w-6 hover:bg-background" : "h-7 w-7 border border-border/60",
          )}
        >
          <Flag className={cn("h-3.5 w-3.5", PRIORITY_STYLE[value])} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" align="start">
        {PRIORITY_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm capitalize hover:bg-accent"
          >
            <Flag className={cn("h-3.5 w-3.5", PRIORITY_STYLE[p])} />
            {p}
            {value === p && <Check className="ml-auto h-3.5 w-3.5" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const RECURRENCE_OPTIONS: { value: ReminderRecurrence; label: string; desc: string }[] = [
  { value: "daily", label: "Daily", desc: "Repeats every day" },
  { value: "weekly", label: "Weekly", desc: "Repeats every 7 days" },
  { value: "monthly", label: "Monthly", desc: "Repeats every month" },
];

function RecurrencePicker({
  value,
  onChange,
  compact,
}: {
  value: ReminderRecurrence | null;
  onChange: (rec: ReminderRecurrence | null) => void;
  compact?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={value ? `Repeats ${value}` : "No repeat"}
          className={cn(
            "inline-flex items-center justify-center rounded-md transition-colors hover:bg-accent",
            compact
              ? "h-6 w-6 text-muted-foreground hover:bg-background hover:text-foreground"
              : "h-7 w-7 border border-border/60 text-muted-foreground hover:text-foreground",
            value && "text-sky-600",
          )}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", value && "animate-spin [animation-duration:3s]")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="start">
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
        >
          <span className="h-3.5 w-3.5" />
          No repeat
          {!value && <Check className="ml-auto h-3.5 w-3.5" />}
        </button>
        {RECURRENCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5 text-sky-500" />
            {opt.label}
            {value === opt.value && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Public-link manager — lets the owner create / revoke / copy share URLs
 * that anonymous people (e.g. clients) can use to drop reminders into the
 * owner's inbox. Submissions land tagged `source = 'public'` and CANNOT
 * reference internal tasks.
 */
function PublicLinkManager({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: tokens = [] } = useQuery(reminderPublicTokensQuery(userId));
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["global-dashboard", "reminder-public-tokens", userId] });

  const active = tokens.filter((t) => !t.revoked_at);

  const create = async () => {
    setCreating(true);
    try {
      await createReminderPublicToken(userId, label.trim() || null);
      setLabel("");
      invalidate();
    } catch (e) {
      toast.error("Failed to create link", { description: (e as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const copy = async (token: string) => {
    const url = `${window.location.origin}/r/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="flex items-center justify-between border-b bg-background px-3 py-1.5 text-[11px]">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Globe className="h-3.5 w-3.5" />
            Public links
            {active.length > 0 && (
              <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                {active.length}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-3" align="start">
          <p className="text-xs font-semibold">Public reminder links</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Share with clients so they can drop reminders into your inbox. External senders cannot
            reference internal tasks.
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Acme Client)"
              className="h-7 text-xs"
            />
            <Button size="sm" onClick={create} disabled={creating} className="h-7">
              Create link
            </Button>
          </div>

          <ul className="mt-3 space-y-1.5">
            {tokens.length === 0 ? (
              <li className="rounded border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground">
                No public links yet.
              </li>
            ) : (
              tokens.map((t) => {
                const url = `${typeof window !== "undefined" ? window.location.origin : ""}/r/${t.token}`;
                const revoked = !!t.revoked_at;
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "flex items-center gap-1.5 rounded border bg-card px-2 py-1.5",
                      revoked && "opacity-50",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{t.label ?? "Unlabeled"}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{url}</p>
                    </div>
                    {!revoked && (
                      <button
                        type="button"
                        onClick={() => copy(t.token)}
                        title="Copy link"
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!revoked ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await revokeReminderPublicToken(t.id);
                            invalidate();
                          } catch (e) {
                            toast.error("Failed to revoke", { description: (e as Error).message });
                          }
                        }}
                        title="Revoke"
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteReminderPublicToken(t.id);
                            invalidate();
                          } catch (e) {
                            toast.error("Failed to delete", { description: (e as Error).message });
                          }
                        }}
                        title="Delete"
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
