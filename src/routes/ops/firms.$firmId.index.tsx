import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, ClipboardList, Activity as ActivityIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-banner";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";

import { firmProjectsQuery, firmUrgentTasksQuery } from "@/lib/queries/ops.queries";
import { useFirmRealtime } from "@/hooks/use-firm-realtime";
import { PROJECT_TYPE_OPTIONS } from "@/lib/shared/domain";

export const Route = createFileRoute("/ops/firms/$firmId/")({
  component: FirmDashboardPage,
  errorComponent: RouteErrorComponent,
});

function FirmDashboardPage() {
  const { firmId } = Route.useParams();
  useFirmRealtime(firmId);

  const projectsQ = useQuery(firmProjectsQuery(firmId));
  const urgentTasksQ = useQuery(firmUrgentTasksQuery(firmId));

  const activeProjects = (projectsQ.data ?? []).filter((p) => p.status === "active");
  const recentTasks = urgentTasksQ.data ?? [];

  return (
    <div className="h-full min-h-0">
      {projectsQ.error && (
        <div className="mb-3">
          <ErrorBanner
            title="Couldn't load projects"
            error={projectsQ.error}
            onRetry={() => projectsQ.refetch()}
          />
        </div>
      )}

      <ResizableTwoPane
        storageKey="firm-dashboard"
        defaultLeft={55}
        minLeft={30}
        maxLeft={75}
        left={
          <Card className="glass border-border-subtle h-full min-h-0 flex flex-col">
            <CardContent className="p-4 flex flex-col h-full min-h-0">
              <div className="mb-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  Active Projects
                </div>
                <Badge variant="secondary">{activeProjects.length}</Badge>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern -mx-1 px-1">
                {projectsQ.isLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                ) : activeProjects.length === 0 ? (
                  <EmptyState
                    icon={<FolderKanban className="h-8 w-8" />}
                    title="No active projects"
                    description="Create a project to start adding client entities and tasks."
                  />
                ) : (
                  <ul className="space-y-1">
                    {activeProjects.map((p) => {
                      const meta =
                        PROJECT_TYPE_OPTIONS.find((o) => o.value === p.project_type) ??
                        PROJECT_TYPE_OPTIONS[PROJECT_TYPE_OPTIONS.length - 1];
                      return (
                        <li key={p.id}>
                          <Link
                            to="/projects/$projectSlug"
                            params={{ projectSlug: p.slug ?? "" }}
                            disabled={!p.slug}
                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors aria-disabled:pointer-events-none aria-disabled:opacity-60"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{p.name}</span>
                              <Badge
                                className={meta.tone + " border-0 shrink-0 text-[10px] px-1.5 py-0"}
                              >
                                {meta.label}
                              </Badge>
                            </div>
                            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                              Tasks {p.tasks_completed}/{p.tasks_total}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        }
        right={
          <Card className="glass border-border-subtle h-full min-h-0 flex flex-col">
            <CardContent className="p-4 flex flex-col h-full min-h-0">
              <div className="mb-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ClipboardList className="h-4 w-4 text-amber-600" />
                  Recent Tasks
                </div>
                <Badge variant="secondary">{recentTasks.length}</Badge>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern -mx-1 px-1">
                {urgentTasksQ.isLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                ) : recentTasks.length === 0 ? (
                  <EmptyState
                    icon={<ActivityIcon className="h-8 w-8" />}
                    title="No open tasks"
                    description="All current tasks are complete."
                  />
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {recentTasks.map((t) => (
                      <li key={t.id}>
                        <Link
                          to="/ops/tasks/$taskId"
                          params={{ taskId: t.id }}
                          className="block px-1.5 py-1.5 hover:bg-muted/40 rounded transition-colors"
                        >
                          <div className="text-sm font-medium truncate">{t.title}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
                            <span>
                              Sub {t.subtasks_completed}/{t.subtasks_total}
                            </span>
                            <span>·</span>
                            <span>
                              Pts {t.ai_completed}/{t.ai_total}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        }
      />
    </div>
  );
}
