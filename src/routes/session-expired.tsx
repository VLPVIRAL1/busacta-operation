import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Clock4, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthScene } from "@/components/auth/auth-scene";

export const Route = createFileRoute("/session-expired")({
  component: SessionExpiredPage,
  errorComponent: RouteErrorComponent,
});

function SessionExpiredPage() {
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
            <Clock4 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl text-gradient">Your session has expired</CardTitle>
          <CardDescription>
            For your security, we signed you out after a period of inactivity. Please sign in again
            to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            asChild
            className="w-full gradient-primary text-primary-foreground shadow-lg focus-ring-auth"
          >
            <Link to="/login" aria-label="Return to sign-in page">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Back to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AuthScene>
  );
}
