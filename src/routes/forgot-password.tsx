import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { sendPasswordResetEmail } from "@/lib/queries/auth.queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthScene } from "@/components/auth/auth-scene";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  errorComponent: RouteErrorComponent,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await sendPasswordResetEmail(
      email,
      `${window.location.origin}/reset-password`,
    );
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success("Check your inbox");
  };

  return (
    <AuthScene>
      <Card className="w-full max-w-md glass-strong border-white/60 animate-scale-in">
        <CardHeader>
          <CardTitle className="text-2xl text-gradient">Reset your password</CardTitle>
          <CardDescription>We'll send a password reset link to your email.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                If an account exists for <strong>{email}</strong>, a reset link is on its way.
              </p>
              <Button asChild variant="outline" className="w-full bg-white/70">
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-required="true"
                  autoComplete="email"
                  className="bg-background/70 dark:bg-background/40 focus-ring-auth"
                />
              </div>
              <Button
                type="submit"
                className="w-full gradient-primary text-primary-foreground shadow-lg"
                disabled={submitting}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
              <Link
                to="/login"
                className="block text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthScene>
  );
}
