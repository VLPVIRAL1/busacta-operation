import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Stale-while-revalidate: serve from cache instantly, refetch in background.
        staleTime: 5 * 60_000, // 5 minutes — feels native/instant on back/forward
        gcTime: 5 * 60_000, // evict 5 min after unmount to prevent unbounded growth in long sessions
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        retry: 2,
        retryDelay: (attempt: number) => Math.min(500 * 2 ** attempt, 8_000),
      },
    },
  });

  // Slow-changing dictionaries: cache for a long time so they almost never
  // trigger a hard loading screen after first login.
  const dictDefaults = { staleTime: 30 * 60_000, gcTime: 60 * 60_000 };
  queryClient.setQueryDefaults(["firms"], dictDefaults);
  queryClient.setQueryDefaults(["firms-list"], dictDefaults);
  queryClient.setQueryDefaults(["firms-list-cl"], dictDefaults);
  queryClient.setQueryDefaults(["firms-employee-options"], dictDefaults);
  queryClient.setQueryDefaults(["users-roles"], dictDefaults);
  queryClient.setQueryDefaults(["templates"], dictDefaults);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Warm the next route's chunk + loader on hover/focus so click-to-render
    // feels near-instant. TanStack Query owns freshness (staleTime below).
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
