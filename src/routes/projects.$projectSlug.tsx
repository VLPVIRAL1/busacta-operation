import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";

// Layout for the readable project URL space. The exact /projects/<slug> page
// lives in projects.$projectSlug.index.tsx; deeper entity/task routes render
// through this Outlet.
export const Route = createFileRoute("/projects/$projectSlug")({
  component: () => <Outlet />,
  errorComponent: RouteErrorComponent,
});
