import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";
import { computeRange, type DateRangePreset } from "@/components/shared/date-range-filter";

export type SimpleRange = { from?: string; to?: string };

const toIso = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : undefined);
const fromIso = (s?: string) => (s ? new Date(s + "T00:00:00") : undefined);

const NAMED_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
];

/**
 * Single-popover date range picker. Shows two months side by side; the user
 * picks the "from" then the "to" without opening two separate calendars.
 */
export function DateRangePicker({
  value,
  onChange,
  className,
  align = "start",
  placeholder = "Pick a date range",
}: {
  value: SimpleRange;
  onChange: (r: SimpleRange) => void;
  className?: string;
  align?: "start" | "center" | "end";
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const range: DateRange = { from: fromIso(value.from), to: fromIso(value.to) };

  const label = (() => {
    if (range.from && range.to)
      return `${format(range.from, "MMM d, yyyy")} → ${format(range.to, "MMM d, yyyy")}`;
    if (range.from) return `${format(range.from, "MMM d, yyyy")} → …`;
    return placeholder;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 justify-start gap-2 font-normal text-xs",
            !range.from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span className="truncate">{label}</span>
          {(range.from || range.to) && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange({});
              }}
              className="ml-1 rounded p-0.5 hover:bg-accent"
              aria-label="Clear date range"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">From</span>
            <span className="font-medium">
              {range.from ? format(range.from, "MMM d, yyyy") : "—"}
            </span>
            <span className="text-muted-foreground">To</span>
            <span className="font-medium">{range.to ? format(range.to, "MMM d, yyyy") : "—"}</span>
          </div>
          <div className="flex items-center gap-1">
            {(["7", "30", "90"] as const).map((d) => (
              <Button
                key={d}
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => {
                  const to = new Date();
                  const from = new Date();
                  from.setDate(to.getDate() - Number(d));
                  onChange({ from: toIso(from), to: toIso(to) });
                }}
              >
                Last {d}d
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => onChange({})}
            >
              Clear
            </Button>
          </div>
        </div>
        <div className="flex">
          {/* Predefined period quick-picks */}
          <div className="flex w-32 shrink-0 flex-col gap-0.5 border-r p-2">
            {NAMED_PRESETS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant="ghost"
                className="h-7 justify-start px-2 text-[11px] font-normal"
                onClick={() => {
                  const r = computeRange(p.value);
                  onChange({ from: r.from, to: r.to });
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={range}
            onSelect={(r) => onChange({ from: toIso(r?.from), to: toIso(r?.to) })}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
