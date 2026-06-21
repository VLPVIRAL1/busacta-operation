import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";

export const Route = createFileRoute("/hr/employees")({
  component: () => <Outlet />,
  errorComponent: RouteErrorComponent,
});
