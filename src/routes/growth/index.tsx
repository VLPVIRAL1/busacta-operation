import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { HubLanding } from "@/components/shell/hub-landing";

export const Route = createFileRoute("/growth/")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Growth" }]}>
        <HubLanding
          moduleKey="growth"
          description="Campaigns, marketing analytics and lead pipeline."
        />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});
