import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { format } from "date-fns";
import { Bell, CalendarClock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";
import { NoteColorPicker } from "./note-color-picker";
import { type NoteColorKey } from "./note-colors";
import { ReminderRichEditor, isTiptapEmpty, tiptapToPlainText } from "./reminder-rich";
import type { ReminderPriority, ReminderRecurrence } from "@/lib/queries/global-dashboard.queries";

/**
 * Composed reminder payload returned by the composer when the user submits.
 * Consumers persist these fields to `personal_reminders` and optionally to
 * `reminder_shares` for the tagged recipients.
 */
export type ComposerPayload = {
  body: string;
  bodyRich: unknown;
  remindAt: string | null;
  color: NoteColorKey;
  priority: ReminderPriority;
  recurrence: ReminderRecurrence | null;
  shareWith: string[];
};

export type ReminderComposerProps = {
  /** Pre-populated date — used by the Calendar view to seed the selected day. */
  defaultDate?: Date;
  /** Default time (HH:mm) — used when defaultDate is supplied. */
  defaultTime?: string;
  /** Whether to expose the "tag people" share picker. Hidden on the public form. */
  showShare?: boolean;
  /**
   * People-tag popover renderer. Injected by the panel so we don't pull the
   * mention/profiles dependency into the public-link page.
   */
  renderSharePicker?: (value: string[], onChange: (next: string[]) => void) => React.ReactNode;
  /** Color/recurrence picker togglers — left to the host to compose. */
  variant?: "panel" | "calendar";
  busy?: boolean;
  onSubmit: (payload: ComposerPayload) => Promise<void> | void;
};

import { Flag, RefreshCw, Check } from "lucide-react";
import type { ReactNode } from "react";

const PRIORITY_STYLE: Record<ReminderPriority, string> = {
  high: "text-rose-500 fill-rose-500/20",
  normal: "text-muted-foreground fill-transparent",
  low: "text-sky-500 fill-sky-500/10",
};
const PRIORITY_ORDER: ReminderPriority[] = ["high", "normal", "low"];

function PriorityPicker({
  value,
  onChange,
}: {
  value: ReminderPriority;
  onChange: (p: ReminderPriority) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Priority: ${value}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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

const RECURRENCE_OPTIONS: { value: ReminderRecurrence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function RecurrencePicker({
  value,
  onChange,
}: {
  value: ReminderRecurrence | null;
  onChange: (rec: ReminderRecurrence | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={value ? `Repeats ${value}` : "No repeat"}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 transition-colors hover:bg-accent",
            value ? "text-sky-600" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" />
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

export function ReminderComposer({
  defaultDate,
  defaultTime = "09:00",
  showShare = true,
  renderSharePicker,
  variant = "panel",
  busy,
  onSubmit,
}: ReminderComposerProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [remindAt, setRemindAt] = useState<Date | undefined>(defaultDate);
  const [time, setTime] = useState<string>(defaultTime);
  const [color, setColor] = useState<NoteColorKey>("default");
  const [priority, setPriority] = useState<ReminderPriority>("normal");
  const [recurrence, setRecurrence] = useState<ReminderRecurrence | null>(null);
  const [shareWith, setShareWith] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  // When the host changes the selected day (calendar view), follow it.
  useEffect(() => {
    if (defaultDate) setRemindAt(defaultDate);
  }, [defaultDate]);

  const handleSubmit = async () => {
    if (!editor) return;
    const json = editor.getJSON();
    if (isTiptapEmpty(json)) return;
    const plain = tiptapToPlainText(json);
    let remindIso: string | null = null;
    if (remindAt) {
      const [h, m] = time.split(":").map(Number);
      const d = new Date(remindAt);
      d.setHours(h || 0, m || 0, 0, 0);
      remindIso = d.toISOString();
    }
    await onSubmit({
      body: plain,
      bodyRich: json,
      remindAt: remindIso,
      color,
      priority,
      recurrence,
      shareWith,
    });
    editor.commands.clearContent(true);
    setRemindAt(defaultDate);
    setTime(defaultTime);
    setColor("default");
    setPriority("normal");
    setRecurrence(null);
    setShareWith([]);
    setResetKey((k) => k + 1);
  };

  return (
    <div className={cn("space-y-2", variant === "panel" && "border-b bg-muted/30 p-3")}>
      <div className="flex items-start gap-2">
        <Bell className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 rounded-md border bg-background shadow-sm">
          <ReminderRichEditor
            key={resetKey}
            placeholder="Remind me to… (use @ to mention people, # to link tasks)"
            onEditorReady={setEditor}
            onEnter={() => void handleSubmit()}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-6">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              {remindAt ? format(remindAt, "MMM d") : "When?"}
              {remindAt ? ` · ${time}` : ""}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={remindAt}
              onSelect={setRemindAt}
              className={cn("p-3 pointer-events-auto")}
            />
            <div className="border-t p-2">
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </PopoverContent>
        </Popover>
        {remindAt && (
          <button
            type="button"
            onClick={() => setRemindAt(undefined)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}

        <PriorityPicker value={priority} onChange={setPriority} />
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />
        <NoteColorPicker value={color} onChange={setColor} title="Reminder colour" />

        {showShare && renderSharePicker && renderSharePicker(shareWith, setShareWith)}

        <div className="flex-1" />
        <Button
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={busy || !editor || isTiptapEmpty(editor.getJSON())}
          className="h-7 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

/** Re-exported helper so the panel can render the picker chrome itself. */
export { PriorityPicker, RecurrencePicker };
export type { ReactNode };
