import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /clients/onboarding redirects to /clients?new=direct which auto-opens the
 * B2C Client onboarding modal. Onboarding wizards now live as modals on
 * the unified /clients hub.
 */
export const Route = createFileRoute("/clients/onboarding")({
  beforeLoad: () => {
    throw redirect({ to: "/clients", search: { new: "direct" as const } });
  },
  component: () => null,
});
