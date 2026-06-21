import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";

export const Route = createFileRoute("/ops/firms")({
  component: () => <Outlet />,
  errorComponent: RouteErrorComponent,
});
