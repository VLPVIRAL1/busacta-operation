import { createFileRoute } from "@tanstack/react-router";
import { SopsPanel, NotesPanel } from "@/components/ops/sops-and-notes";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";

export const Route = createFileRoute("/ops/firms/$firmId/sops")({
  component: FirmSopsPage,
  errorComponent: RouteErrorComponent,
});

function FirmSopsPage() {
  const { firmId } = Route.useParams();
  return (
    <div className="h-full min-h-0">
      <ResizableTwoPane
        storageKey="firm-sops"
        defaultLeft={50}
        minLeft={25}
        maxLeft={75}
        left={
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <SopsPanel firm_id={firmId} />
          </div>
        }
        right={
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <NotesPanel firm_id={firmId} />
          </div>
        }
      />
    </div>
  );
}
