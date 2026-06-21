import { createFileRoute, redirect } from "@tanstack/react-router";

// Holiday Calendar is now a tab on the unified /hr/payroll page.
export const Route = createFileRoute("/hr/payroll/holidays")({
  beforeLoad: () => {
    throw redirect({ to: "/hr/payroll", search: { view: "holidays" } });
  },
});
