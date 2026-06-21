import { ChevronDown, Check, X, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";

export interface FacetedChipOption {
  value: string;
  label: string;
  /** When provided (key present), the option renders an avatar with this image + label initials. */
  avatarUrl?: string | null;
}

function initialsFrom(label: string) {
  const parts = label
    .replace(/\s*\(Me\)\s*$/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

export interface FacetedMultiChipProps {
  icon?: React.ReactNode;
  label: string;
  options: FacetedChipOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  /** Per-option count, used to render `Label (n)` and dim zero-count options. */
  counts?: Map<string, number>;
  /** Render a profile avatar next to each option (uses option.avatarUrl + label initials). */
  showAvatars?: boolean;
  /** Show a "Select all / Deselect all" action at the top of the list. */
  enableSelectAll?: boolean;
  className?: string;
}

/**
 * Shared faceted multi-select filter chip.
 *
 * Displays `Label (count)` for each option, sorts by count desc when counts
 * are present, dims options with zero matches, and offers a Clear footer.
 */
export function FacetedMultiChip({
  icon,
  label,
  options,
  selected,
  onChange,
  counts,
  showAvatars,
  enableSelectAll,
  className,
}: FacetedMultiChipProps) {
  const count = selected.length;
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const allSelected = options.length > 0 && selected.length >= options.length;

  const sorted = counts
    ? [...options].sort(
        (a, b) =>
          (counts.get(b.value) ?? 0) - (counts.get(a.value) ?? 0) || a.label.localeCompare(b.label),
      )
    : options;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-2 text-[11px] shrink-0",
            count > 0 && "border-primary/60",
            className,
          )}
        >
          {icon}
          <span>{label}</span>
          {count > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {count}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="max-h-64 overflow-y-auto">
          {enableSelectAll && options.length > 0 && (
            <button
              type="button"
              onClick={() => onChange(allSelected ? [] : options.map((o) => o.value))}
              className="mb-1 flex w-full items-center gap-2 rounded-sm border-b px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {allSelected ? "Deselect all" : "Select all"}
              <span className="ml-auto text-[10px] tabular-nums">{options.length}</span>
            </button>
          )}
          {sorted.length === 0 ? (
            <div className="px-2 py-3 text-xs italic text-muted-foreground">No options</div>
          ) : (
            sorted.map((opt) => {
              const checked = selected.includes(opt.value);
              const n = counts?.get(opt.value) ?? 0;
              const dim = !!counts && n === 0 && !checked;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent",
                    checked && "bg-accent/50",
                    dim && "opacity-40",
                  )}
                >
                  {showAvatars && (
                    <Avatar className="h-5 w-5 shrink-0">
                      {opt.avatarUrl ? <AvatarImage src={opt.avatarUrl} alt={opt.label} /> : null}
                      <AvatarFallback className="bg-primary/10 text-[9px] font-medium text-primary">
                        {initialsFrom(opt.label)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className="truncate text-left flex-1">{opt.label}</span>
                  {counts && (
                    <span className="text-[10px] tabular-nums text-muted-foreground">{n}</span>
                  )}
                  {checked && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              );
            })
          )}
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent border-t"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface FacetedSingleChipProps {
  icon?: React.ReactNode;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  /** A value considered the "no filter" state — chip shows inactive when matched. */
  emptyValue: string;
  onChange: (v: string) => void;
  counts?: Map<string, number>;
  className?: string;
}

/** Single-select sibling of FacetedMultiChip. Same visual language. */
export function FacetedSingleChip({
  icon,
  label,
  options,
  value,
  emptyValue,
  onChange,
  counts,
  className,
}: FacetedSingleChipProps) {
  const active = value !== emptyValue;
  const current = options.find((o) => o.value === value);

  const sorted = counts
    ? [...options].sort(
        (a, b) =>
          (counts.get(b.value) ?? 0) - (counts.get(a.value) ?? 0) || a.label.localeCompare(b.label),
      )
    : options;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-2 text-[11px] shrink-0",
            active && "border-primary/60",
            className,
          )}
        >
          {icon}
          <span>{label}</span>
          {active && current && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {current.label}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="max-h-64 overflow-y-auto">
          {sorted.map((opt) => {
            const checked = value === opt.value;
            const n = counts?.get(opt.value) ?? 0;
            const showCount = !!counts && opt.value !== emptyValue;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent",
                  checked && "bg-accent/50",
                )}
              >
                <span className="truncate text-left flex-1">{opt.label}</span>
                {showCount && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">{n}</span>
                )}
                {checked && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
