import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { RespondentWizard } from "@/components/organizer/respondent-wizard";

export const Route = createFileRoute("/portal/organizer/$deploymentId")({
  component: PortalOrganizerWizardPage,
  errorComponent: RouteErrorComponent,
});

function PortalOrganizerWizardPage() {
  const { deploymentId } = Route.useParams();
  // /portal layout already enforces auth + client-only role; the wizard's
  // own server fns scope every read/write to assignee_profile_id = auth.uid().
  return (
    <RespondentWizard
      deploymentId={deploymentId}
      exitTo="/portal/organizer"
      exitLabel="Back to my organizers"
    />
  );
}
