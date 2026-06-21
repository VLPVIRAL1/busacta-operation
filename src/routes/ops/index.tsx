import { createFileRoute, redirect } from "@tanstack/react-router";

// The Ops Hub entry (/ops) has no landing page of its own — it bounces the user
// to the last Ops sub-page they had open (recorded in AppShell), or to the
// Workspace by default. The dashboard component still exists in the codebase
// but is intentionally not linked here.
const OPS_LAST_PATH_KEY = "ops:last-path";
const OPS_DEFAULT = "/ops/workspace";

type Landing = { to: string; search: Record<string, string> };

function resolveOpsLanding(): Landing {
  const fallback: Landing = { to: OPS_DEFAULT, search: {} };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(OPS_LAST_PATH_KEY);
    if (!saved) return fallback;
    const [pathname, searchStr] = saved.split("?");
    // Loop guard: only ever redirect to a concrete Ops sub-page, never the bare
    // /ops index itself (which is THIS route) — otherwise beforeLoad recurses.
    if (!pathname.startsWith("/ops/") || pathname === "/ops/") return fallback;
    const search = searchStr ? Object.fromEntries(new URLSearchParams(searchStr)) : {};
    return { to: pathname, search };
  } catch {
    return fallback;
  }
}

export const Route = createFileRoute("/ops/")({
  beforeLoad: () => {
    const { to, search } = resolveOpsLanding();
    // Use `to`/`search` (the router's internal navigation) rather than `href`:
    // an href redirect re-enters this route on client navigation and loops.
    throw redirect({ to: to as never, search: search as never });
  },
});
