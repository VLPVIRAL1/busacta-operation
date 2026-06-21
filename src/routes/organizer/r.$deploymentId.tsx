import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { RespondentWizard } from "@/components/organizer/respondent-wizard";

export const Route = createFileRoute("/organizer/r/$deploymentId")({
  component: () => {
    const { deploymentId } = Route.useParams();
    return (
      <AuthGuard>
        <RespondentWizard deploymentId={deploymentId} exitTo="/organizer" />
      </AuthGuard>
    );
  },
  errorComponent: RouteErrorComponent,
});
