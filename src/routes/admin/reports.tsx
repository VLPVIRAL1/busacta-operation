import { createFileRoute, redirect } from "@tanstack/react-router";

// Reports were merged into the Monitoring page (/admin/activity-audit).
export const Route = createFileRoute("/admin/reports")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/activity-audit", search: { tab: "performance" } });
  },
});
