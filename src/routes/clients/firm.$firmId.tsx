import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";

export const Route = createFileRoute("/clients/firm/$firmId")({
  component: () => <Outlet />,
  errorComponent: RouteErrorComponent,
});
