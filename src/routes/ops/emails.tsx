import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ops/emails")({
  beforeLoad: () => {
    throw redirect({ to: "/email/hub" });
  },
  component: () => null,
});
