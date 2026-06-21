import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";

/**
 * Compact inline date editor used in the Work Item meta header.
 * Trigger renders the label + value (or placeholder); popover hosts a
 * shadcn Calendar plus a Clear action.
 *
 * `value` accepts an ISO date string ("YYYY-MM-DD") or a full ISO timestamp;
 * `onChange` returns either an ISO date string (when `dateOnly`) or an ISO
 * timestamp at midnight UTC.
 */
export function InlineDatePopover({
  label,
  value,
  onChange,
  dateOnly = true,
  disabled,
  toneClass,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  dateOnly?: boolean;
  disabled?: boolean;
  toneClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = value
    ? new Date(dateOnly && value.length === 10 ? `${value}T00:00:00` : value)
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-7 gap-1.5 px-2 text-xs font-normal",
            !date && "text-muted-foreground",
            toneClass,
          )}
        >
          <CalendarIcon className="h-3 w-3 opacity-70" />
          <span className="font-medium text-foreground/80">{label}:</span>
          <span>{date ? format(date, "MMM d, yyyy") : "—"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (!d) return;
            const iso = dateOnly
              ? format(d, "yyyy-MM-dd")
              : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
            onChange(iso);
            setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        {date && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start text-xs text-muted-foreground"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <X className="mr-1.5 h-3 w-3" /> Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
