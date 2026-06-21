import { createFileRoute } from "@tanstack/react-router";
import { OpenPointsPanel } from "@/components/ops/open-points-panel";
import { RouteErrorComponent } from "@/components/shared/route-error";

export const Route = createFileRoute("/ops/firms/$firmId/open-points")({
  component: FirmOpenPointsPage,
  errorComponent: RouteErrorComponent,
});

function FirmOpenPointsPage() {
  const { firmId } = Route.useParams();
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <OpenPointsPanel firm_id={firmId} />
    </div>
  );
}
