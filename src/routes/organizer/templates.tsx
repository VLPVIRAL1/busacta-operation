import { createFileRoute, redirect } from "@tanstack/react-router";

// Mirror /organizer for the Tier-2 "Templates" link.
export const Route = createFileRoute("/organizer/templates")({
  beforeLoad: () => {
    throw redirect({ to: "/organizer" });
  },
});
