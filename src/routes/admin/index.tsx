import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { HubLanding } from "@/components/shell/hub-landing";
import { DatabaseBackupsCard } from "@/components/admin/database-backups-card";

export const Route = createFileRoute("/admin/")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Admin" }]}>
        <div className="space-y-6">
          <HubLanding moduleKey="admin" description="Access control, branding and security." />
          <DatabaseBackupsCard />
        </div>
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});
