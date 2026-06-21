import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { HubLanding } from "@/components/shell/hub-landing";

export const Route = createFileRoute("/guide/")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "Guide" }]}>
        <HubLanding moduleKey="guide" description="Manuals, workflows and FAQs." />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});
