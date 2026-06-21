import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Skeleton } from "@/components/ui/skeleton";
import { taskBySlugQuery } from "@/lib/queries/ops.queries";
import { TaskDetailView } from "@/routes/ops/tasks.$taskId";

// Canonical task URL: /projects/<project>/<entity>/<task>. We resolve the task
// by its (globally unique) slug, then verify it actually belongs to the named
// project + entity so the readable URL stays internally consistent.
export const Route = createFileRoute("/projects/$projectSlug/$entitySlug/$taskSlug")({
  component: NestedTaskPage,
  errorComponent: RouteErrorComponent,
});

function NestedTaskPage() {
  const { projectSlug, entitySlug, taskSlug } = Route.useParams();
  const { data: task, isLoading } = useQuery(taskBySlugQuery(taskSlug));
  if (isLoading) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  const ce = (
    task as {
      client_entities?: { slug?: string; projects?: { slug?: string } | null } | null;
    } | null
  )?.client_entities;
  if (!task || ce?.slug !== entitySlug || ce?.projects?.slug !== projectSlug) throw notFound();
  return <TaskDetailView taskId={task.id} />;
}
