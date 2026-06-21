import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ops/workload")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/reports", search: { tab: "workload" } });
  },
  component: () => null,
});
