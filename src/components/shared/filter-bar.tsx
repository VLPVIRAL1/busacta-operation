/**
 * FilterBar — DRY primitive for "search + filters + clear" toolbar rows.
 *
 * Headless-ish: consumer owns state, passes values + onChange. No data
 * fetching. Filters render as popovers; supports search, multi-select,
 * single-select, and a custom render escape hatch.
 *
 * Deployment is opt-in per call site (see .lovable/plan.md). Golden Master
 * files MUST NOT import this — they keep their existing inline filters.
 */
import { useMemo, type ReactNode } from "react";
import { Search, X, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/shared/utils";

export type FilterOption = { value: string; label: string };

export type FilterDef =
  | {
      id: string;
      label: string;
      kind: "multi-select";
      value: string[];
      options: FilterOption[];
      onChange: (next: string[]) => void;
    }
  | {
      id: string;
      label: string;
      kind: "single-select";
      value: string | null;
      options: FilterOption[];
      onChange: (next: string | null) => void;
    }
  | {
      id: string;
      label: string;
      kind: "custom";
      /** Caller fully controls the trigger + popover content. */
      render: () => ReactNode;
      /** Number of active selections, drives the active-state count badge. */
      activeCount?: number;
    };

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  onClearAll,
  actions,
  className,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  onClearAll?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  const activeCount = useMemo(
    () =>
      (filters ?? []).reduce((sum, f) => {
        if (f.kind === "multi-select") return sum + f.value.length;
        if (f.kind === "single-select") return sum + (f.value ? 1 : 0);
        return sum + (f.activeCount ?? 0);
      }, 0) + (search ? 1 : 0),
    [filters, search],
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {onSearchChange && (
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 pl-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {(filters ?? []).map((f) => (
        <FilterChip key={f.id} def={f} />
      ))}

      {actions}

      {activeCount > 0 && onClearAll && (
        <Button type="button" variant="ghost" size="sm" onClick={onClearAll} className="h-9">
          <X className="mr-1 h-3.5 w-3.5" />
          Clear ({activeCount})
        </Button>
      )}
    </div>
  );
}

function FilterChip({ def }: { def: FilterDef }) {
  if (def.kind === "custom") {
    return <>{def.render()}</>;
  }

  const count = def.kind === "multi-select" ? def.value.length : def.value ? 1 : 0;
  const labelText = def.label;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-9 gap-2", count > 0 && "border-primary/60")}
        >
          <span>{labelText}</span>
          {count > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {count}
            </Badge>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <ScrollArea className="max-h-64">
          {def.kind === "single-select" && def.value && (
            <button
              type="button"
              onClick={() => def.onChange(null)}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <span>Clear selection</span>
              <X className="h-3 w-3" />
            </button>
          )}
          {def.options.map((opt) => {
            const checked =
              def.kind === "multi-select" ? def.value.includes(opt.value) : def.value === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => {
                  if (def.kind === "multi-select") {
                    def.onChange(
                      checked
                        ? def.value.filter((v) => v !== opt.value)
                        : [...def.value, opt.value],
                    );
                  } else {
                    def.onChange(checked ? null : opt.value);
                  }
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                  checked && "bg-accent/50",
                )}
              >
                <span className="truncate text-left">{opt.label}</span>
                {checked && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            );
          })}
          {def.options.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">No options</div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
