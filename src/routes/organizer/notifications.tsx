import { createFileRoute, redirect } from "@tanstack/react-router";

// Organizer-scoped notifications view forwards to the shared notifications center.
// (Filtering by organizer kinds is a follow-up enhancement once /ops/notifications
// exposes a validated search schema.)
export const Route = createFileRoute("/organizer/notifications")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/notifications" });
  },
});
