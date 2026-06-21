import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectCode } from "@/components/shared/entity-code";
import { cn } from "@/lib/shared/utils";
import { portalPipelineQuery, type PortalPipelineStage } from "@/lib/queries/portal.queries";

type Props = { firmId: string };

type ProjectGroup = {
  projectId: string;
  name: string;
  code: string | null;
  stages: Array<PortalPipelineStage & { count: number }>;
};

/** Per-project pipeline progress: ordered stages with how many tasks sit in each. */
export function PortalPipeline({ firmId }: Props) {
  const { data, isLoading } = useQuery(portalPipelineQuery(firmId));

  const groups = useMemo<ProjectGroup[]>(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const t of data.tasks) {
      if (t.pipeline_stage_id)
        counts.set(t.pipeline_stage_id, (counts.get(t.pipeline_stage_id) ?? 0) + 1);
    }
    const byProject = new Map<string, ProjectGroup>();
    for (const s of data.stages) {
      if (!byProject.has(s.project_id)) {
        byProject.set(s.project_id, {
          projectId: s.project_id,
          name: s.projects?.name ?? "Project",
          code: s.projects?.code ?? null,
          stages: [],
        });
      }
      byProject.get(s.project_id)!.stages.push({ ...s, count: counts.get(s.id) ?? 0 });
    }
    return [...byProject.values()];
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading progress…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-10 w-10" />}
        title="No pipeline to show"
        description="Once your engagements move through stages, their progress shows here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.projectId} className="glass border-border-subtle">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ProjectCode code={g.code} name={g.name} />
              <span className="truncate">{g.name}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {g.stages.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      s.count > 0
                        ? "border-primary/40 bg-primary/10 font-medium text-foreground"
                        : "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color || "var(--muted-foreground)" }}
                    />
                    {s.label}
                    {s.count > 0 && (
                      <Badge variant="secondary" className="h-4 px-1 text-[10px] tabular-nums">
                        {s.count}
                      </Badge>
                    )}
                  </div>
                  {i < g.stages.length - 1 && <span className="text-muted-foreground/50">→</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
