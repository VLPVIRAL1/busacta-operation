import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ops/email-templates")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/templates" });
  },
  component: () => null,
});
