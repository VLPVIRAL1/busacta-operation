import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy /dashboard route — superseded by /global-dashboard.
 * Kept as a redirect so existing bookmarks and deep links keep working.
 */
export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/global-dashboard", replace: true });
  },
  component: () => null,
});
