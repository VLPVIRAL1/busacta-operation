import { createFileRoute, redirect } from "@tanstack/react-router";

// Learning & Training was extracted from HR into its own Tier-1 hub
// per the BusAcTa Operations blueprint. Old links are permanently redirected.
export const Route = createFileRoute("/hr/training")({
  beforeLoad: () => {
    throw redirect({ to: "/learning/courses" });
  },
});
