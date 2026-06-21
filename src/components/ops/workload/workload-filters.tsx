import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";

export type WorkloadSortKey = "utilization" | "open_tasks" | "name";

interface WorkloadFiltersProps {
  departments: string[];
  selectedDept: string | null;
  onDeptChange: (dept: string | null) => void;
  search: string;
  onSearchChange: (q: string) => void;
  sort: WorkloadSortKey;
  onSortChange: (s: WorkloadSortKey) => void;
  className?: string;
}

export function WorkloadFilters({
  departments,
  selectedDept,
  onDeptChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  className,
}: WorkloadFiltersProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 w-48 text-sm"
        />
      </div>

      <Select
        value={selectedDept ?? "__all__"}
        onValueChange={(v) => onDeptChange(v === "__all__" ? null : v)}
      >
        <SelectTrigger className="h-8 w-44 text-sm">
          <SelectValue placeholder="All departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All departments</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(v) => onSortChange(v as WorkloadSortKey)}>
        <SelectTrigger className="h-8 w-44 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="utilization">Sort: Utilization ↓</SelectItem>
          <SelectItem value="open_tasks">Sort: Open tasks ↓</SelectItem>
          <SelectItem value="name">Sort: Name A–Z</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
