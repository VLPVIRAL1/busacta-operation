import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/lib/shared/theme";
import { Toaster } from "@/components/ui/sonner";
import { usePerfTelemetry } from "@/lib/shared/use-perf-telemetry";
import { RouteErrorBoundary } from "@/components/shared/error-boundary";
import { installGlobalErrorReporter } from "@/lib/error/client-error-reporter";
import { installServerFnAuth } from "@/lib/auth/server-fn-auth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect, useState } from "react";

// Defer non-critical, always-mounted widgets out of the root bundle.
// They render after first paint, so they should not block FCP/TTI.
const FloatingTimer = lazy(() =>
  import("@/components/ops/floating-timer").then((m) => ({ default: m.FloatingTimer })),
);
const TimerRecoveryPrompt = lazy(() =>
  import("@/components/ops/timer-recovery-prompt").then((m) => ({
    default: m.TimerRecoveryPrompt,
  })),
);
const DeviceLimitGate = lazy(() =>
  import("@/components/auth/device-limit-gate").then((m) => ({ default: m.DeviceLimitGate })),
);

const QUICK_LINKS: { to: string; label: string; description: string }[] = [
  { to: "/global-dashboard", label: "Dashboard", description: "Your home overview" },
  { to: "/ops", label: "Operations", description: "Firms, tasks & pipeline" },
  { to: "/hr", label: "Human Resources", description: "Team & timesheets" },
  { to: "/admin", label: "Admin", description: "Settings & users" },
  { to: "/login", label: "Sign in", description: "Switch account" },
];

function QuickLinksGrid() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {QUICK_LINKS.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className="group flex flex-col items-start rounded-xl border border-border bg-card/60 px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-card hover:shadow-md"
        >
          <span className="text-sm font-semibold text-foreground group-hover:text-primary">
            {l.label}{" "}
            <span
              aria-hidden
              className="ml-1 transition-transform group-hover:translate-x-0.5 inline-block"
            >
              →
            </span>
          </span>
          <span className="text-xs text-muted-foreground">{l.description}</span>
        </Link>
      ))}
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="rounded-3xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur sm:p-12">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Error 404
            </p>
            <h1 className="mt-3 bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-6xl font-bold tracking-tight text-transparent sm:text-7xl">
              Page not found
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
              We couldn't find the page you're looking for. It may have been moved, renamed, or
              never existed. Pick a destination below to keep going.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Link
                to="/global-dashboard"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
              >
                Go to dashboard
              </Link>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (typeof window !== "undefined") window.history.back();
                }}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Go back
              </a>
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Or jump to
            </p>
            <QuickLinksGrid />
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-destructive/10 px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="rounded-3xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur sm:p-12">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
              Unexpected error
            </p>
            <h1 className="mt-3 bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
              Something went wrong
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
              An unexpected error occurred while loading this page. Try again, head back, or jump to
              another area.
            </p>
            {import.meta.env.DEV && error?.message && (
              <details className="mx-auto mt-4 max-w-md text-left">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                  Error details (dev only)
                </summary>
                <pre className="mt-2 overflow-auto rounded-md bg-destructive/10 border border-destructive/30 p-3 text-[11px] leading-relaxed text-destructive whitespace-pre-wrap break-words max-h-40">
                  {error.message}
                </pre>
              </details>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => {
                  router.invalidate();
                  reset();
                }}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              >
                Try again
              </button>
              <Link
                to="/global-dashboard"
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Go to dashboard
              </Link>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (typeof window !== "undefined") window.location.reload();
                }}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Reload page
              </a>
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Or jump to
            </p>
            <QuickLinksGrid />
          </div>
        </div>
      </div>
    </div>
  );
}
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TaxOps Suite — Offshore Accounting & Tax Operations" },
      {
        name: "description",
        content:
          "Professional offshore tax compliance and client communication suite for B2B firms.",
      },
      { property: "og:title", content: "TaxOps Suite — Offshore Accounting & Tax Operations" },
      { name: "twitter:title", content: "TaxOps Suite — Offshore Accounting & Tax Operations" },
      {
        property: "og:description",
        content:
          "Professional offshore tax compliance and client communication suite for B2B firms.",
      },
      {
        name: "twitter:description",
        content:
          "Professional offshore tax compliance and client communication suite for B2B firms.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ce243a0d-1211-412a-8bf1-a576fd630d41/id-preview-4bf8e058--32ad53cf-7e33-44a8-9c04-082c1ea10491.lovable.app-1778227763783.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ce243a0d-1211-412a-8bf1-a576fd630d41/id-preview-4bf8e058--32ad53cf-7e33-44a8-9c04-082c1ea10491.lovable.app-1778227763783.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "TaxOps Suite" },
      { property: "og:url", content: "https://one.busacta.com/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "TaxOps Suite",
          url: "https://one.busacta.com/",
          description:
            "Professional offshore tax compliance and client communication suite for B2B firms.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "TaxOps Suite",
          url: "https://one.busacta.com/",
        }),
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      // Warm the Supabase TCP+TLS handshake so the first auth/db call is faster.
      {
        rel: "preconnect",
        href: "https://sgewqhxcknlllpkcurkf.supabase.co",
        crossOrigin: "anonymous",
      },
      { rel: "dns-prefetch", href: "https://sgewqhxcknlllpkcurkf.supabase.co" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Defer mounting the non-critical widget tree until after first paint so
  // the initial route render isn't blocked by their chunks/effects.
  const [deferredReady, setDeferredReady] = useState(false);
  useEffect(() => {
    installGlobalErrorReporter();
    installServerFnAuth();
    const w =
      typeof window !== "undefined"
        ? (window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
          })
        : null;
    const idle = w?.requestIdleCallback
      ? (cb: () => void) => w.requestIdleCallback!(cb, { timeout: 1500 })
      : (cb: () => void) => window.setTimeout(cb, 200);
    const id = idle(() => setDeferredReady(true));
    return () => {
      if (w?.cancelIdleCallback) {
        w.cancelIdleCallback(id);
      } else {
        window.clearTimeout(id);
      }
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
            <PerfTelemetry />
            <RouteErrorBoundary>
              <Outlet />
            </RouteErrorBoundary>
            {deferredReady && (
              <Suspense fallback={null}>
                <FloatingTimer />
                <TimerRecoveryPrompt />
                <DeviceLimitGate />
              </Suspense>
            )}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function PerfTelemetry() {
  usePerfTelemetry();
  return null;
}
