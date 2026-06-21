import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectCode } from "@/components/shared/entity-code";
import { portalTimesheetQuery, type PortalTimeSummaryRow } from "@/lib/queries/portal.queries";

type Props = { firmId: string };

function fmtHours(minutes: number): string {
  const h = minutes / 60;
  return `${h.toFixed(h < 10 ? 1 : 0)} h`;
}

type ProjectGroup = {
  projectId: string;
  name: string;
  code: string | null;
  totalMinutes: number;
  tasks: PortalTimeSummaryRow[];
};

/**
 * Read-only billable time summary. Backed by the aggregate-only
 * `portal_billable_time_summary` RPC — never exposes per-entry notes, who
 * logged time, or timestamps.
 */
export function PortalTimesheet({ firmId }: Props) {
  const { data, isLoading } = useQuery(portalTimesheetQuery(firmId));

  const groups = useMemo<ProjectGroup[]>(() => {
    const byProject = new Map<string, ProjectGroup>();
    for (const r of data ?? []) {
      if (!byProject.has(r.project_id)) {
        byProject.set(r.project_id, {
          projectId: r.project_id,
          name: r.project_name,
          code: r.project_code,
          totalMinutes: 0,
          tasks: [],
        });
      }
      const g = byProject.get(r.project_id)!;
      g.totalMinutes += r.total_minutes;
      g.tasks.push(r);
    }
    return [...byProject.values()];
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading time…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="h-10 w-10" />}
        title="No billable time yet"
        description="Time your team logs against your engagements will be summarised here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.projectId} className="glass border-border-subtle">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <ProjectCode code={g.code} name={g.name} />
                <span className="truncate">{g.name}</span>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {fmtHours(g.totalMinutes)}
              </span>
            </div>
            <ul className="divide-y">
              {g.tasks.map((t) => (
                <li
                  key={t.task_id}
                  className="flex items-center justify-between gap-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate text-muted-foreground">{t.task_title}</span>
                  <span className="shrink-0 tabular-nums">{fmtHours(t.total_minutes)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
