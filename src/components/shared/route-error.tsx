import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, RefreshCcw, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const QUICK_LINKS: { to: string; label: string }[] = [
  { to: "/global-dashboard", label: "Dashboard" },
  { to: "/ops", label: "Operations" },
  { to: "/hr", label: "Human Resources" },
  { to: "/admin", label: "Admin" },
];

export function RouteErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="relative min-h-[60vh] w-full">
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-3xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
              Page error
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Something went wrong</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground break-words">
              We hit an unexpected issue while loading this page. Try again, or pick another
              destination below.
            </p>
            {error?.message && (
              <details className="mx-auto mt-4 max-w-md text-left">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                  Error details
                </summary>
                <pre className="mt-2 overflow-auto rounded-md bg-destructive/10 border border-destructive/30 p-3 text-[11px] leading-relaxed text-destructive whitespace-pre-wrap break-words max-h-40">
                  {error.message}
                </pre>
                {error?.stack && (
                  <pre className="mt-1 overflow-auto rounded-md bg-muted/50 p-2 text-[10px] leading-tight text-muted-foreground whitespace-pre-wrap break-words max-h-40">
                    {error.stack}
                  </pre>
                )}
              </details>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  router.invalidate();
                  reset();
                }}
                className="gap-2"
              >
                <RefreshCcw className="h-4 w-4" />
                Try again
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => router.history.back()}>
                <ArrowLeft className="h-4 w-4" />
                Go back
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/global-dashboard">
                  <Home className="h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-8">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Jump to
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-accent hover:text-primary"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
