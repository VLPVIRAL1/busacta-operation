import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SmartDateInput } from "@/components/shared/smart-date-input";
import { toISODate } from "@/lib/format/format-date";

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "week_to_date"
  | "last_week"
  | "this_month"
  | "month_to_date"
  | "last_month"
  | "this_quarter"
  | "quarter_to_date"
  | "last_quarter"
  | "this_year"
  | "year_to_date"
  | "last_year"
  | "custom";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "week_to_date", label: "Week-to-date" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "month_to_date", label: "Month-to-date" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "quarter_to_date", label: "Quarter-to-date" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "year_to_date", label: "Year-to-date" },
  { value: "last_year", label: "Last Year" },
  { value: "custom", label: "Custom" },
];

export function computeRange(
  preset: DateRangePreset,
  today: Date = new Date(),
): { from: string; to: string } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ymd = (d: Date) => toISODate(d);
  const startOfWeek = (d: Date) => {
    const x = new Date(d);
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    return x;
  };
  const endOfWeek = (d: Date) => {
    const s = startOfWeek(d);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    return e;
  };
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const qIdx = (d: Date) => Math.floor(d.getMonth() / 3);
  const startOfQuarter = (d: Date) => new Date(d.getFullYear(), qIdx(d) * 3, 1);
  const endOfQuarter = (d: Date) => new Date(d.getFullYear(), qIdx(d) * 3 + 3, 0);
  const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
  const endOfYear = (d: Date) => new Date(d.getFullYear(), 11, 31);
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  switch (preset) {
    case "today":
      return { from: ymd(t), to: ymd(t) };
    case "yesterday": {
      const y = addDays(t, -1);
      return { from: ymd(y), to: ymd(y) };
    }
    case "this_week":
      return { from: ymd(startOfWeek(t)), to: ymd(endOfWeek(t)) };
    case "week_to_date":
      return { from: ymd(startOfWeek(t)), to: ymd(t) };
    case "last_week": {
      const s = addDays(startOfWeek(t), -7);
      const e = addDays(s, 6);
      return { from: ymd(s), to: ymd(e) };
    }
    case "this_month":
      return { from: ymd(startOfMonth(t)), to: ymd(endOfMonth(t)) };
    case "month_to_date":
      return { from: ymd(startOfMonth(t)), to: ymd(t) };
    case "last_month": {
      const s = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const e = new Date(t.getFullYear(), t.getMonth(), 0);
      return { from: ymd(s), to: ymd(e) };
    }
    case "this_quarter":
      return { from: ymd(startOfQuarter(t)), to: ymd(endOfQuarter(t)) };
    case "quarter_to_date":
      return { from: ymd(startOfQuarter(t)), to: ymd(t) };
    case "last_quarter": {
      const s = new Date(t.getFullYear(), qIdx(t) * 3 - 3, 1);
      const e = new Date(t.getFullYear(), qIdx(t) * 3, 0);
      return { from: ymd(s), to: ymd(e) };
    }
    case "this_year":
      return { from: ymd(startOfYear(t)), to: ymd(endOfYear(t)) };
    case "year_to_date":
      return { from: ymd(startOfYear(t)), to: ymd(t) };
    case "last_year": {
      const s = new Date(t.getFullYear() - 1, 0, 1);
      const e = new Date(t.getFullYear() - 1, 11, 31);
      return { from: ymd(s), to: ymd(e) };
    }
    default:
      return { from: ymd(startOfMonth(t)), to: ymd(t) };
  }
}

interface Props {
  preset: DateRangePreset;
  from: string;
  to: string;
  onChange: (next: { preset: DateRangePreset; from: string; to: string }) => void;
  className?: string;
}

export function DateRangeFilter({ preset, from, to, onChange, className }: Props) {
  const presetLabel = useMemo(
    () => PRESETS.find((p) => p.value === preset)?.label ?? "Custom",
    [preset],
  );
  return (
    <div className={`flex flex-wrap items-end gap-3 ${className ?? ""}`}>
      <div>
        <Label className="text-xs">Period</Label>
        <Select
          value={preset}
          onValueChange={(v) => {
            const np = v as DateRangePreset;
            if (np === "custom") {
              onChange({ preset: "custom", from, to });
            } else {
              const r = computeRange(np);
              onChange({ preset: np, from: r.from, to: r.to });
            }
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={presetLabel} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">From</Label>
        <SmartDateInput
          value={from}
          onChange={(v) => onChange({ preset: "custom", from: v, to })}
          className="w-44"
        />
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <SmartDateInput
          value={to}
          onChange={(v) => onChange({ preset: "custom", from, to: v })}
          className="w-44"
        />
      </div>
    </div>
  );
}
