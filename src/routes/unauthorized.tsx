import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy alias — forward to the friendly /access-denied page.
export const Route = createFileRoute("/unauthorized")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/access-denied",
      search: { from: search.redirect, need: undefined },
    });
  },
  component: () => null,
});
