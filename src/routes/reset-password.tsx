import { createFileRoute, useRouter } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateUserPassword } from "@/lib/queries/auth.queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthScene } from "@/components/auth/auth-scene";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  errorComponent: RouteErrorComponent,
});

function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    const { error } = await updateUserPassword(password);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    router.navigate({ to: "/global-dashboard" });
  };

  return (
    <AuthScene>
      <Card className="w-full max-w-md glass-strong border-white/60 animate-scale-in">
        <CardHeader>
          <CardTitle className="text-2xl text-gradient">Set a new password</CardTitle>
          <CardDescription>Choose a strong password you don't use elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-required="true"
                aria-describedby="new-pw-help"
                autoComplete="new-password"
                minLength={8}
                className="bg-background/70 dark:bg-background/40 focus-ring-auth"
              />
              <span id="new-pw-help" className="sr-only">
                Use at least 8 characters; avoid passwords used elsewhere.
              </span>
            </div>
            <Button
              type="submit"
              className="w-full gradient-primary text-primary-foreground shadow-lg focus-ring-auth"
              disabled={submitting}
              aria-disabled={submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {submitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthScene>
  );
}
