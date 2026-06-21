import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/shared/utils";

export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { key: K; dir: SortDir };

export function SortableTh<K extends string>({
  field,
  label,
  sort,
  onSortChange,
  className,
  align = "left",
}: {
  field: K;
  label: string;
  sort: SortState<K>;
  onSortChange: (next: SortState<K>) => void;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const active = sort.key === field;
  const dir = active ? sort.dir : null;
  return (
    <th className={cn("px-3 py-2 text-xs uppercase text-muted-foreground select-none", className)}>
      <button
        type="button"
        onClick={() =>
          onSortChange(
            active && dir === "asc"
              ? { key: field, dir: "desc" }
              : { key: field, dir: active ? "asc" : "desc" },
          )
        }
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" && "ml-auto",
          active && "text-foreground",
        )}
      >
        <span>{label}</span>
        {!active && <ArrowUpDown className="h-3 w-3 opacity-50" />}
        {active && dir === "asc" && <ArrowUp className="h-3 w-3" />}
        {active && dir === "desc" && <ArrowDown className="h-3 w-3" />}
      </button>
    </th>
  );
}
