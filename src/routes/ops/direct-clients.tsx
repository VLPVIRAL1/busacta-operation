import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ops/direct-clients")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/workspace" });
  },
  component: () => null,
});
