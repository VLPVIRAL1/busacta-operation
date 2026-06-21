import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ops/productivity")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/reports", search: { tab: "productivity" } });
  },
  component: () => null,
});
