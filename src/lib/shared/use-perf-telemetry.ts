// Lightweight client-side performance telemetry.
// Captures TTFB, FCP, page render time per route and POSTs to page_perf_events.
// Best-effort: never throws, never blocks UI.
import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

function getNavTimings() {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const paint = performance.getEntriesByType("paint");
    const fcp = paint.find((p) => p.name === "first-contentful-paint")?.startTime;
    return {
      ttfb_ms: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
      load_ms: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
      fcp_ms: fcp ? Math.round(fcp) : null,
    };
  } catch {
    return { ttfb_ms: null, load_ms: null, fcp_ms: null };
  }
}

// Module-level guard: throttle telemetry across all route changes in this tab.
let lastWriteAt = 0;
const MIN_INTERVAL_MS = 30_000; // at most one write every 30s
const SAMPLE_RATE = 0.2; // and only ~20% of eligible navigations

const SKIP_PREFIXES = [
  "/portal",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/access-denied",
  "/forbidden",
  "/unauthorized",
  "/session-expired",
];

export function usePerfTelemetry() {
  const location = useLocation();
  const route = location.pathname;
  const mountTimeRef = useRef<number>(0);
  const queryStartRef = useRef<number>(performance.now());

  useEffect(() => {
    if (SKIP_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`))) return;
    if (Date.now() - lastWriteAt < MIN_INTERVAL_MS) return;
    if (Math.random() > SAMPLE_RATE) return;

    mountTimeRef.current = performance.now();
    const t = setTimeout(async () => {
      try {
        const renderMs = Math.round(performance.now() - mountTimeRef.current);
        const queryMs = Math.round(performance.now() - queryStartRef.current);
        const { ttfb_ms, fcp_ms, load_ms } = getNavTimings();
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("page_perf_events" as never).insert({
          user_id: u?.user?.id ?? null,
          route,
          ttfb_ms,
          fcp_ms,
          load_ms,
          query_ms: queryMs,
          render_ms: renderMs,
          user_agent: navigator.userAgent,
        } as never);
        lastWriteAt = Date.now();
      } catch {
        // swallow — telemetry must never break the app
      }
    }, 1500); // wait for queries/render to settle
    return () => clearTimeout(t);
  }, [route]);
}
