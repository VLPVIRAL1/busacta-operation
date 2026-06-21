import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ops/emails/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/email/settings" });
  },
  component: () => null,
});
