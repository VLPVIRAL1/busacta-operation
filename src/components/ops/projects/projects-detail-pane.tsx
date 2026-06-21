import { FolderKanban } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ProjectDetailView } from "./project-detail-view";

/**
 * Right pane of the Projects compact split view. Renders the existing
 * Project Detail body inline (no navigation) via the shared
 * `ProjectDetailView` component in `embedded` mode.
 */
export function ProjectsDetailPane({ projectId }: { projectId: string | null }) {
  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<FolderKanban className="h-8 w-8" />}
          title="Pick a project"
          description="Select a project from the list to see its work items."
        />
      </div>
    );
  }
  return <ProjectDetailView projectId={projectId} embedded />;
}
