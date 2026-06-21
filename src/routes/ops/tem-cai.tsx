import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ops/tem-cai")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/templates" });
  },
  component: () => null,
});
