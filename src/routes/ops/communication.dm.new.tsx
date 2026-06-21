import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { DirectMessagesPage } from "@/components/ops/direct-messages-page";

export const Route = createFileRoute("/ops/communication/dm/new")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[
          { label: "Communication", to: "/ops/communication" },
          { label: "Direct Messages", to: "/ops/communication/dm" },
          { label: "New" },
        ]}
      >
        <DirectMessagesPage initialCompose />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});
