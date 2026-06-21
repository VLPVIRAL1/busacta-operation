import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { TaskDetailView } from "@/routes/ops/tasks.$taskId";

// Canonical hierarchical task URL: /ops/tasks/<firmId>/<projectId>/<taskSlug>
// Firm + project context is embedded in the URL for clarity and deduplication.
// The $taskSlug is globally unique, so $firmId/$projectId act as organisational
// breadcrumbs rather than filters — we still resolve by slug alone.
export const Route = createFileRoute("/ops/tasks/$firmId/$projectId/$taskSlug")({
  component: HierarchicalTaskPage,
  validateSearch: (search: Record<string, unknown>): { tab?: "task" | "time" | "files" } => {
    const tab = search.tab;
    return tab === "task" || tab === "time" || tab === "files" ? { tab } : {};
  },
  errorComponent: RouteErrorComponent,
});

function HierarchicalTaskPage() {
  const { taskSlug } = Route.useParams();
  const { data: task, isLoading } = useQuery({
    queryKey: ["task-by-slug", taskSlug],
    enabled: !!taskSlug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, slug")
        .eq("slug", taskSlug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (!task) throw notFound();
  return <TaskDetailView taskId={task.id} />;
}
