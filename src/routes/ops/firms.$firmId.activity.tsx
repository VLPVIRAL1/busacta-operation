import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { FirmActivityPanel } from "@/components/ops/firm-activity-panel";

export const Route = createFileRoute("/ops/firms/$firmId/activity")({
  component: FirmActivityPage,
  errorComponent: RouteErrorComponent,
});

function FirmActivityPage() {
  const { firmId } = Route.useParams();
  return (
    <Card className="glass border-border-subtle h-full min-h-0 flex flex-col">
      <CardContent className="p-5 flex-1 min-h-0 overflow-y-auto scroll-modern">
        <FirmActivityPanel firmId={firmId} title="Firm activity timeline" />
      </CardContent>
    </Card>
  );
}
