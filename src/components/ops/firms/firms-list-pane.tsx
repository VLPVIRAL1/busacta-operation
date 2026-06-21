import { useMemo, useState } from "react";
import { Search, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AssigneeStack } from "@/components/shared/assignee-stack";
import { EmptyState } from "@/components/shared/empty-state";
import { FirmCode } from "@/components/shared/entity-code";
import { cn } from "@/lib/shared/utils";

export interface FirmListRow {
  id: string;
  name: string;
  firm_identifier: string | null;
  us_timezone: string | null;
  tzShort: string;
  team: Array<{ id: string; name: string; avatar_url: string | null }>;
}

/**
 * Left pane of the Firms split view. Mirrors ProjectsListPane look:
 * sticky pane search, count line, scrollable list, violet active treatment.
 */
export function FirmsListPane({
  rows,
  selectedId,
  onSelect,
}: {
  rows: FirmListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.firm_identifier ?? ""}`.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-background/95 backdrop-blur px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter firms in pane…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground tabular-nums text-right">
          {filtered.length} firm{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title="No firms"
              description="Adjust the header filters or pane search."
            />
          </div>
        ) : (
          filtered.map((f) => {
            const active = selectedId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f.id)}
                className={cn(
                  "w-full text-left rounded-md border-l-2 border-transparent pl-2 pr-2.5 py-2 transition-colors",
                  "border-y border-r border-transparent hover:bg-violet-500/5",
                  active
                    ? "bg-violet-500/10 border-l-violet-400/60 border-y-violet-500/30 border-r-violet-500/30"
                    : "border-l-violet-400/30",
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <FirmCode code={f.firm_identifier} name={f.name} />
                  <span className="text-xs font-medium truncate flex-1">{f.name}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                    {f.tzShort}
                  </span>
                  <div className="ml-auto">
                    {f.team.length > 0 ? (
                      <AssigneeStack people={f.team} max={3} size="sm" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Unassigned</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
