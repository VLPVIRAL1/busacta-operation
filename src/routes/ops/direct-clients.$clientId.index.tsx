import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ops/direct-clients/$clientId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/ops/workspace/direct/$clientId", params });
  },
  component: () => null,
});
