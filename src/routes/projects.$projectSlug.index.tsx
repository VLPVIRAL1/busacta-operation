import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectDetailView } from "@/components/ops/projects/project-detail-view";
import { projectBySlugQuery } from "@/lib/queries/ops.queries";

// Canonical project detail page: /projects/<project-slug>.
export const Route = createFileRoute("/projects/$projectSlug/")({
  component: ProjectPage,
  errorComponent: RouteErrorComponent,
});

function ProjectPage() {
  const { projectSlug } = Route.useParams();
  const { data: project, isLoading } = useQuery(projectBySlugQuery(projectSlug));
  if (isLoading) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!project) throw notFound();
  const firm = project.firms;
  return (
    <AuthGuard>
      <AppShell
        crumbs={[
          { label: "Firms", to: "/ops/firms" },
          firm ? { label: firm.name, to: `/ops/firms/${firm.id}` } : { label: "…" },
          { label: project.name },
        ]}
      >
        <ProjectDetailView projectId={project.id} />
      </AppShell>
    </AuthGuard>
  );
}
