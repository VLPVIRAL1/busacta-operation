import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";

// Pure layout route. The split-view page lives in workspace.index.tsx so that
// child routes (workspace.firms.$firmId, workspace.direct.$clientId) render via
// the <Outlet /> instead of being swallowed by the split view. Search params are
// validated on the index route, not here, so child routes can define their own.
export const Route = createFileRoute("/ops/workspace")({
  component: () => <Outlet />,
  errorComponent: RouteErrorComponent,
});
