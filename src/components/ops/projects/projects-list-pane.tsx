import { useMemo, useState } from "react";
import { Search, FolderKanban, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AssigneeStack } from "@/components/shared/assignee-stack";
import { EmptyState } from "@/components/shared/empty-state";
import { FirmCode, ProjectCode } from "@/components/shared/entity-code";
import { cn } from "@/lib/shared/utils";
import { PROJECT_TYPE_OPTIONS } from "@/lib/shared/domain";

export interface ProjectListRow {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  project_type: string;
  status: string;
  firm_name: string;
  firm_identifier: string | null;
  taskTotal: number;
  taskDone: number;
  assignees: Array<{ id: string; name: string; avatar_url: string | null }>;
}

/**
 * Left pane of the Projects Command Center compact split view.
 * Groups projects by Firm with a sticky firm header (To-Do split list look).
 * No status badge — status is filtered via the top filter row.
 */
export function ProjectsListPane({
  rows,
  selectedId,
  onSelect,
}: {
  rows: ProjectListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.code ?? ""} ${r.firm_name} ${r.firm_identifier ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, q]);

  // Group by firm so the left pane mirrors the To-Do list pane's
  // Firm → Project grouping.
  const groups = useMemo(() => {
    const buckets = new Map<
      string,
      { firmName: string; firmCode: string | null; items: ProjectListRow[] }
    >();
    for (const r of filtered) {
      const key = `${r.firm_identifier ?? ""}::${r.firm_name}`;
      const b = buckets.get(key) ?? {
        firmName: r.firm_name,
        firmCode: r.firm_identifier,
        items: [],
      };
      b.items.push(r);
      buckets.set(key, b);
    }
    return Array.from(buckets.values()).sort((a, b) => a.firmName.localeCompare(b.firmName));
  }, [filtered]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-background/95 backdrop-blur px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter projects in pane…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground tabular-nums text-right">
          {filtered.length} project{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FolderKanban className="h-8 w-8" />}
              title="No projects"
              description="Adjust the header filters or pane search."
            />
          </div>
        ) : (
          groups.map((g) => (
            <div key={`${g.firmCode}::${g.firmName}`} className="space-y-1">
              <div className="flex items-center gap-1.5 px-1.5 py-1 sticky top-0 z-[1] bg-background/95 backdrop-blur rounded">
                <Building2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                <FirmCode code={g.firmCode} name={g.firmName} />
                <span className="text-[11px] font-medium truncate">{g.firmName}</span>
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                  {g.items.length}
                </span>
              </div>
              {g.items.map((p) => {
                const ptMeta =
                  PROJECT_TYPE_OPTIONS.find((o) => o.value === p.project_type) ??
                  PROJECT_TYPE_OPTIONS[PROJECT_TYPE_OPTIONS.length - 1];
                const pct = p.taskTotal === 0 ? 0 : Math.round((p.taskDone / p.taskTotal) * 100);
                const active = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelect(p.id)}
                    className={cn(
                      "w-full text-left rounded-md border-l-2 border-transparent pl-2 pr-2.5 py-2 transition-colors",
                      "border-y border-r border-transparent hover:bg-violet-500/5",
                      active
                        ? "bg-violet-500/10 border-l-violet-400/60 border-y-violet-500/30 border-r-violet-500/30"
                        : "border-l-violet-400/30",
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ProjectCode code={p.code} name={p.name} />
                      <span className="text-xs font-medium truncate flex-1">{p.name}</span>
                      <Badge className={ptMeta.tone + " border-0 text-[10px] shrink-0"}>
                        {ptMeta.label}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                        {p.taskDone}/{p.taskTotal}
                      </span>
                      <Progress value={pct} className="h-1 flex-1" />
                      {p.assignees.length > 0 && (
                        <AssigneeStack people={p.assignees} max={3} size="sm" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
