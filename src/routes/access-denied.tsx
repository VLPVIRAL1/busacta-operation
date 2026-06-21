import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { LockKeyhole, ArrowLeft, Home, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthScene } from "@/components/auth/auth-scene";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_LABEL, formatRoles, requiredRolesFor } from "@/lib/routing/route-access";
import type { AppRole } from "@/lib/routing/use-nav";
import { RouteErrorComponent } from "@/components/shared/route-error";

export const Route = createFileRoute("/access-denied")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from : undefined,
    need: typeof s.need === "string" ? s.need : undefined,
  }),
  component: AccessDeniedPage,
  errorComponent: RouteErrorComponent,
});

function AccessDeniedPage() {
  const { from, need } = Route.useSearch();
  const router = useRouter();
  const { user, roles } = useAuth();
  const needRoles = (
    need ? need.split(",") : from ? (requiredRolesFor(from) ?? []) : []
  ) as AppRole[];
  const myRoles = (roles ?? []) as AppRole[];

  return (
    <AuthScene>
      <Card
        className="w-full max-w-md glass-strong border-white/60 animate-scale-in"
        role="alert"
        aria-live="polite"
      >
        <CardHeader className="space-y-2">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-md"
            aria-hidden
          >
            <LockKeyhole className="h-6 w-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            403 · Access Denied
          </p>
          <CardTitle className="text-2xl text-gradient">
            You don't have access to this page
          </CardTitle>
          <CardDescription>
            {from ? (
              <>
                The page <span className="font-mono">{from}</span> is restricted to certain roles.
              </>
            ) : (
              <>This area is restricted to certain roles.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1.5">
            <div>
              <span className="text-muted-foreground">Required role: </span>
              <span className="font-medium">
                {needRoles.length ? formatRoles(needRoles) : "Restricted"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Your role: </span>
              <span className="font-medium">
                {myRoles.length
                  ? myRoles.map((r) => ROLE_LABEL[r] ?? r).join(", ")
                  : user
                    ? "No role assigned"
                    : "Not signed in"}
              </span>
            </div>
          </div>
          <Button asChild className="w-full gradient-primary text-primary-foreground shadow-lg">
            <a
              href={`mailto:?subject=${encodeURIComponent("Access request for " + (from ?? "page"))}&body=${encodeURIComponent("Hi,%0A%0APlease grant me access to " + (from ?? "this page") + ". My current role: " + (myRoles.join(", ") || "none") + ".")}`}
            >
              <Mail className="mr-2 h-4 w-4" /> Request access from your admin
            </a>
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => router.history.back()}
            >
              <ArrowLeft className="h-4 w-4" /> Go back
            </Button>
            <Button variant="outline" className="flex-1 gap-2" asChild>
              <Link to="/global-dashboard">
                <Home className="h-4 w-4" /> Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </AuthScene>
  );
}
