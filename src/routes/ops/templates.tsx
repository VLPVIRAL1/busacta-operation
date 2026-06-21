import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { TemplatesWorkspace } from "@/components/ops/templates/templates-workspace";

export const Route = createFileRoute("/ops/templates")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "employee"]}>
      <AppShell crumbs={[{ label: "Workflow Templates" }]} fullBleed>
        <TemplatesWorkspace category="workflow" />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});
