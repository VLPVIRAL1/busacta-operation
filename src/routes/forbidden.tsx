import { createFileRoute, useRouter } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { ShieldAlert, ArrowLeft, Home, Mail, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthScene } from "@/components/auth/auth-scene";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/forbidden")({
  component: ForbiddenPage,
  errorComponent: RouteErrorComponent,
});

const ROLE_HOME: Record<string, string> = {
  super_admin: "/admin",
  admin: "/admin",
  hr_manager: "/hr",
  employee: "/ops",
  client: "/global-dashboard",
};

function ForbiddenPage() {
  const router = useRouter();
  const { user, role, signOut } = useAuth();
  const home = (role && ROLE_HOME[role]) || "/global-dashboard";

  return (
    <AuthScene>
      <Card
        className="w-full max-w-md glass-strong border-white/60 animate-scale-in"
        role="alert"
        aria-live="polite"
      >
        <CardHeader className="space-y-2">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-md"
            aria-hidden
          >
            <ShieldAlert className="h-6 w-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
            403 · Forbidden
          </p>
          <CardTitle className="text-2xl">You don't have access to this page</CardTitle>
          <CardDescription>
            {user
              ? `Your account (${user.email}) doesn't have permission to view this resource. If this looks wrong, ask an administrator to grant access.`
              : "This area requires a higher permission level than your current session has."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button asChild className="w-full gap-2">
            <a href={home}>
              <Home className="h-4 w-4" /> Go to my dashboard
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
              <a href="mailto:support@busacta.com?subject=Access%20request">
                <Mail className="h-4 w-4" /> Request access
              </a>
            </Button>
          </div>
          {user && (
            <Button
              variant="ghost"
              className="w-full gap-2 text-xs text-muted-foreground"
              onClick={async () => {
                await signOut();
                router.navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out and switch account
            </Button>
          )}
          {role && (
            <p className="text-[11px] text-muted-foreground text-center pt-2">
              Signed in as <span className="font-medium capitalize">{role.replace("_", " ")}</span>
            </p>
          )}
        </CardContent>
      </Card>
    </AuthScene>
  );
}
