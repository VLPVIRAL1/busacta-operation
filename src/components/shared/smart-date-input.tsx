import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";
import { fmtDMY, toISODate } from "@/lib/format/format-date";

interface Props {
  value: string; // YYYY-MM-DD or ""
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseInput(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  // YYYY-MM-DD
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // DD-MMM-YYYY or DD/MMM/YYYY
  m = t.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{2,4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return new Date(y, mi, +m[1]);
    }
  }
  // DD/MM/YYYY or DD-MM-YYYY
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return new Date(y, +m[2] - 1, +m[1]);
  }
  return null;
}

function shortcut(key: string, base: Date): Date | null {
  const d = new Date(base);
  switch (key) {
    case "t":
      return new Date();
    case "y":
      return new Date(d.getFullYear(), 0, 1);
    case "r":
      return new Date(d.getFullYear(), 11, 31);
    case "m":
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case "h":
      return new Date(d.getFullYear(), d.getMonth() + 1, 0);
    case "w": {
      const x = new Date(d);
      const day = x.getDay();
      x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
      return x;
    }
    case "k": {
      const x = new Date(d);
      const day = x.getDay();
      x.setDate(x.getDate() + ((day === 0 ? -6 : 1 - day) + 6));
      return x;
    }
    case "+":
    case "=":
      d.setDate(d.getDate() + 1);
      return d;
    case "-":
    case "_":
      d.setDate(d.getDate() - 1);
      return d;
    case "[":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "]":
      d.setMonth(d.getMonth() + 1);
      return d;
  }
  return null;
}

export function SmartDateInput({
  value,
  onChange,
  className,
  placeholder = "DD-MMM-YYYY",
  disabled,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value ? fmtDMY(value) : "");
  }, [value]);

  const commit = (d: Date | null) => {
    if (d && !Number.isNaN(d.getTime())) {
      onChange(toISODate(d));
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k.length === 1 && /[tymrhwk+\-=_[\]]/.test(k)) {
      // Only treat as shortcut when the buffer is empty-ish — never hijack mid-typing
      if (
        text.trim() === "" ||
        k === "+" ||
        k === "-" ||
        k === "=" ||
        k === "_" ||
        k === "[" ||
        k === "]"
      ) {
        const base = value ? new Date(value + "T00:00:00") : new Date();
        const next = shortcut(k, base);
        if (next) {
          e.preventDefault();
          commit(next);
          return;
        }
      }
    }
    if (e.key === "Enter") {
      const d = parseInput(text);
      if (d) {
        e.preventDefault();
        commit(d);
      }
    }
  };

  const handleBlur = () => {
    const d = parseInput(text);
    if (d) commit(d);
    else if (value) setText(fmtDMY(value));
    else setText("");
  };

  return (
    <div className={cn("relative flex items-center", className)}>
      <Input
        id={id}
        ref={inputRef}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        onBlur={handleBlur}
        className="pr-9"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="absolute right-0 top-0 h-9 w-9 text-muted-foreground"
            tabIndex={-1}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value ? new Date(value + "T00:00:00") : undefined}
            onSelect={(d) => {
              if (d) {
                commit(d);
                setOpen(false);
              }
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="border-t px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Shortcuts:</span> T today · Y/R year
            start/end · M/H month · W/K week · +/− day · [ / ] month
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
