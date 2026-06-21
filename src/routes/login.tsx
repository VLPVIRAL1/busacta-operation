import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Sparkles, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

import { AuthScene } from "@/components/auth/auth-scene";
import { useServerFn } from "@tanstack/react-start";
import { markDeviceChosen, revokeOtherDevices } from "@/lib/auth/active-devices.functions";
import { markAppMfaVerified } from "@/lib/auth/mfa-gate";
import { getOrCreateDeviceId } from "@/lib/auth/device-id";

const KEEP_SIGNED_IN_KEY = "keep-signed-in";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — TaxOps Suite" },
      {
        name: "description",
        content:
          "Sign in to TaxOps Suite to manage firms, projects, tasks, time logs and reports for your offshore tax operations team.",
      },
      { property: "og:title", content: "Sign in — TaxOps Suite" },
      {
        property: "og:description",
        content: "Sign in to access your TaxOps Suite operations workspace.",
      },
      { property: "og:url", content: "https://one.busacta.com/login" },
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: "https://one.busacta.com/login" }],
  }),
  component: LoginPage,
  errorComponent: RouteErrorComponent,
});

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [keepSignedIn, setKeepSignedIn] = useState(true);

  const markChosenFn = useServerFn(markDeviceChosen);
  const revokeOthersFn = useServerFn(revokeOtherDevices);

  const revokeWithRetry = async (
    keepDeviceId: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const attempt = async () => revokeOthersFn({ data: { keepDeviceId } });
    try {
      await attempt();
      return { ok: true };
    } catch (e1) {
      console.warn("revoke_other_devices failed, retrying", e1);
      await new Promise((r) => setTimeout(r, 400));
      try {
        await attempt();
        return { ok: true };
      } catch (e2: unknown) {
        const msg = e2 instanceof Error ? e2.message : "Couldn't sign out other sessions";
        return { ok: false, error: msg };
      }
    }
  };

  const finishSignIn = async (uid: string) => {
    const deviceId = getOrCreateDeviceId();
    markAppMfaVerified(uid);
    try {
      await markChosenFn({ data: { deviceId } });
    } catch (e) {
      console.warn("markDeviceChosen failed", e);
    }
    const res = await revokeWithRetry(deviceId);
    if (!res.ok) {
      toast.warning("Signed in, but couldn't sign out other devices. Clean them up from Settings.");
    }
    router.navigate({ to: "/global-dashboard" });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const next: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" && !next.email) next.email = issue.message;
        if (key === "password" && !next.password) next.password = issue.message;
      }
      setFieldErrors(next);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(KEEP_SIGNED_IN_KEY, keepSignedIn ? "true" : "false");
      sessionStorage.setItem("session-active", "1");
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSubmitting(false);
      setFormError(error.message);
      toast.error(error.message);
      return;
    }
    const uid = data.user?.id;
    setSubmitting(false);
    if (!uid) {
      toast.error("Sign-in succeeded but no user returned");
      return;
    }
    toast.success("Welcome back");
    await finishSignIn(uid);
  };

  // If a session already exists (e.g. visiting /login while signed in), shortcut to dashboard.
  const autoHandledRef = useRef(false);
  useEffect(() => {
    if (user && !submitting && !autoHandledRef.current) {
      autoHandledRef.current = true;
      void finishSignIn(user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, submitting]);

  return (
    <AuthScene>
      <Card className="w-full max-w-md bg-card/95 supports-[backdrop-filter]:backdrop-blur-xl border border-border animate-scale-in shadow-elegant relative overflow-hidden">
        <CardHeader className="space-y-2 relative">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/20">
            <Sparkles className="h-3 w-3" aria-hidden /> Secure sign-in
          </span>
          <CardTitle className="text-3xl text-gradient leading-tight">
            Welcome to BusAcTa Operations.
          </CardTitle>
          <CardDescription className="text-foreground/70">
            Powering global Offshore Accounting and B2B client collaboration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" aria-label="Sign in form" noValidate>
            <div aria-live="polite" role="status">
              {formError && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {formError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@firm.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                }}
                autoComplete="email"
                required
                aria-required="true"
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                className="focus-ring-auth"
              />
              {fieldErrors.email && (
                <p id="email-error" role="alert" className="text-xs text-destructive">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary hover:underline focus-ring-auth rounded-sm"
                  aria-label="Reset your password"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  autoComplete="current-password"
                  required
                  aria-required="true"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  className="pr-10 focus-ring-auth"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-ring-auth rounded-md"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" role="alert" className="text-xs text-destructive">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="keep-signed-in"
                checked={keepSignedIn}
                onCheckedChange={(v) => setKeepSignedIn(v === true)}
                aria-describedby="keep-signed-in-help"
              />
              <Label htmlFor="keep-signed-in" className="text-sm font-normal cursor-pointer">
                Keep me signed in on this browser
              </Label>
            </div>
            <Button
              type="submit"
              className="w-full gradient-primary text-primary-foreground shadow-lg focus-ring-auth"
              disabled={submitting}
              aria-disabled={submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
            <p id="keep-signed-in-help" className="text-center text-xs text-muted-foreground pt-1">
              {keepSignedIn
                ? "You'll stay signed in until you sign out."
                : "You'll be signed out when you close the browser."}
            </p>
            <div className="text-center">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-destructive hover:underline focus-ring-auth rounded-sm"
                onClick={async () => {
                  if (typeof window !== "undefined") {
                    localStorage.removeItem(KEEP_SIGNED_IN_KEY);
                    localStorage.removeItem("active-role");
                    sessionStorage.removeItem("session-active");
                  }
                  try {
                    await supabase.auth.signOut();
                  } catch {
                    /* ignore */
                  }
                  setKeepSignedIn(false);
                  toast.success("This browser has been forgotten. You'll need to sign in again.");
                }}
              >
                Forget this browser &amp; sign out
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthScene>
  );
}
