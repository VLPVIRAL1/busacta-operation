import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Skeleton } from "@/components/ui/skeleton";
import { projectBySlugQuery, entityBySlugQuery } from "@/lib/queries/ops.queries";
import { EntityDetailView } from "@/routes/ops/entities.$entityId";

// Canonical entity detail page: /projects/<project-slug>/<entity-slug>.
export const Route = createFileRoute("/projects/$projectSlug/$entitySlug/")({
  component: EntityPage,
  errorComponent: RouteErrorComponent,
});

function EntityPage() {
  const { projectSlug, entitySlug } = Route.useParams();
  const { data: project, isLoading: projectLoading } = useQuery(projectBySlugQuery(projectSlug));
  const { data: entity, isLoading: entityLoading } = useQuery(
    entityBySlugQuery(project?.id, entitySlug),
  );
  if (projectLoading || entityLoading) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!project || !entity) throw notFound();
  return <EntityDetailView entityId={entity.id} />;
}
