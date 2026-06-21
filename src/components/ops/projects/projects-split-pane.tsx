import { useEffect } from "react";
import { usePersistentSelection } from "@/lib/ops/use-persistent-selection";
import { ProjectsListPane, type ProjectListRow } from "./projects-list-pane";
import { ProjectsDetailPane } from "./projects-detail-pane";

const SELECTED_LS_KEY = "projects.split.selectedProjectId";

/**
 * 35/65 split-pane Compact view for the Projects Command Center.
 * Mirrors `TodosSplitPane` exactly so layout/ux stays consistent.
 */
export function ProjectsSplitPane({ rows }: { rows: ProjectListRow[] }) {
  const [selectedId, setSelectedId] = usePersistentSelection(SELECTED_LS_KEY);

  // Auto-select first project on initial load if nothing valid is selected.
  useEffect(() => {
    if (rows.length === 0) return;
    if (selectedId && rows.some((r) => r.id === selectedId)) return;
    setSelectedId(rows[0].id);
  }, [rows, selectedId, setSelectedId]);

  return (
    <div className="h-[calc(100svh-240px)] min-h-[480px] grid md:grid-cols-[35%_65%] grid-cols-1 border rounded-lg overflow-hidden bg-background">
      <div className="min-h-0 border-r">
        <ProjectsListPane rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="min-h-0">
        <ProjectsDetailPane projectId={selectedId} />
      </div>
    </div>
  );
}
