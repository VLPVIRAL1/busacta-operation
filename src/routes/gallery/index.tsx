import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { GalleryBrowser } from "@/components/gallery/gallery-browser";

export const Route = createFileRoute("/gallery/")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "File Gallery" }]}>
        <GalleryBrowser />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});
