import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarClock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/shared/user-avatar";
import { PeoplePicker } from "@/components/shared/people-picker";
import { LevelGlyph } from "@/lib/ui/task-option-icons";
import type { ProjectLevelRow } from "@/lib/queries/ops.queries";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared task meta field controls.
 *
 * These were originally defined privately inside the Task View route
 * (`src/routes/ops/tasks.$taskId.tsx`). They are extracted here so the canonical
 * Task View header and the Global Dashboard "Details" tab render the exact same
 * editable controls — no duplicated widget logic.
 */

/** Project-level difficulty/urgency picker. Renders nothing when no levels are configured. */
export function ProjectLevelPicker({
  label,
  levels,
  value,
  onChange,
}: {
  label: string;
  levels: ProjectLevelRow[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const selected = levels.find((l) => l.id === value) ?? null;

  if (levels.length === 0) return null;

  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
      <SelectTrigger
        className="h-8 w-auto min-w-[2.5rem] justify-center gap-1 px-2 text-xs"
        aria-label={`${label}: ${selected?.label ?? "none"}`}
        title={`${label}: ${selected?.label ?? "— None —"}`}
        style={selected?.color ? { borderColor: selected.color, color: selected.color } : undefined}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-1">
            <LevelGlyph name={selected.icon} className="shrink-0" />
            <span className="hidden truncate text-[11px] sm:inline">{selected.label}</span>
          </span>
        ) : (
          <span className="text-[11px] italic text-muted-foreground">{label}</span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— {label} —</SelectItem>
        {levels.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            <span className="flex items-center gap-1.5">
              <LevelGlyph name={l.icon} />
              {l.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Assignees / Reviewers avatar-stack picker backed by PeoplePicker. */
export function AvatarPickerPopover({
  icon,
  label,
  ids,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  ids: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1.5 px-2 text-xs font-normal"
        >
          {icon}
          <span className="font-medium text-foreground/80">{label}:</span>
          {ids.length === 0 ? (
            <span className="italic text-muted-foreground">none</span>
          ) : (
            <span className="flex -space-x-1.5">
              {ids.slice(0, 3).map((id) => (
                <UserAvatar key={id} userId={id} size="sm" />
              ))}
              {ids.length > 3 && (
                <span className="ml-1 text-[11px] text-muted-foreground">+{ids.length - 3}</span>
              )}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <PeoplePicker
          value={ids}
          onChange={onChange}
          placeholder={`Pick ${label.toLowerCase()}…`}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Click-to-edit tax-year badge. */
export function InlineYearEditor({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? String(value) : "");
  if (!editing) {
    return (
      <Badge
        variant="outline"
        className="inline-flex h-7 cursor-pointer items-center gap-1 text-[11px] hover:bg-accent"
        onClick={() => {
          setDraft(value ? String(value) : "");
          setEditing(true);
        }}
        title="Click to edit tax year"
      >
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {value ? `TY ${value}` : "+ Year"}
      </Badge>
    );
  }
  const commit = () => {
    setEditing(false);
    const n = parseInt(draft, 10);
    const next = Number.isFinite(n) && n >= 1900 && n <= 2999 ? n : null;
    if (next !== value) onSave(next);
  };
  return (
    <Input
      autoFocus
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      className="h-7 w-24 text-xs"
      placeholder="YYYY"
    />
  );
}

/** Firm-scoped client / group selector. Renders nothing without a firm. */
export function TaskClientPicker({
  firmId,
  value,
  onChange,
}: {
  firmId: string | null;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { data: clients } = useQuery({
    queryKey: ["task-client-picker", firmId],
    enabled: !!firmId,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, kind, parent_id")
        .eq("firm_id", firmId!)
        .order("name");
      return (data ?? []) as {
        id: string;
        name: string;
        kind: "client" | "group";
        parent_id: string | null;
      }[];
    },
  });
  if (!firmId) return null;
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
      <SelectTrigger className="h-7 w-48 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <SelectValue placeholder="Client / Group" />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— No client —</SelectItem>
        {(clients ?? []).map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.kind === "group" ? "📁 " : ""}
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
