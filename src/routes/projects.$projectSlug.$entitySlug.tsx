import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";

// Layout for /projects/<project>/<entity>. The exact entity page lives in
// projects.$projectSlug.$entitySlug.index.tsx; the nested task route renders
// through this Outlet.
export const Route = createFileRoute("/projects/$projectSlug/$entitySlug")({
  component: () => <Outlet />,
  errorComponent: RouteErrorComponent,
});
