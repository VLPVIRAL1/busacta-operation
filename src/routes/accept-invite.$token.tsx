import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { useBranding } from "@/lib/shared/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { acceptInvitation, lookupInvitation } from "@/lib/auth/invitations.functions";
import { AuthScene } from "@/components/auth/auth-scene";

export const Route = createFileRoute("/accept-invite/$token")({
  component: AcceptInvitePage,
  errorComponent: RouteErrorComponent,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const router = useRouter();
  const branding = useBranding();
  const { user, refreshRole } = useAuth();
  const lookupInvite = useServerFn(lookupInvitation);
  const acceptInvite = useServerFn(acceptInvitation);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Public read of invite metadata via dedicated function call (we use direct table query
  // since invitations table is admin-only RLS, so we need a public lookup function).
  const {
    data: invite,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["invite-lookup", token],
    queryFn: async () => {
      return lookupInvite({ data: { token } });
    },
  });

  // If the user is already signed in with the matching email, auto-accept.
  useEffect(() => {
    if (!user || !invite?.ok || accepted) return;
    if (invite.email && user.email?.toLowerCase() === invite.email.toLowerCase()) {
      void acceptNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, invite]);

  const acceptNow = async () => {
    const result = await acceptInvite({ data: { token } });
    if (!result.ok) {
      toast.error(`Could not accept: ${result.error}`);
      return;
    }
    await refreshRole();
    setAccepted(true);
    toast.success("Welcome aboard!");
    setTimeout(() => router.navigate({ to: "/global-dashboard" }), 1200);
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite?.email) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    const { error: signErr } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/accept-invite/${token}` },
    });
    setSubmitting(false);
    if (signErr) {
      // If user already exists, advise sign-in
      if (signErr.message.toLowerCase().includes("already")) {
        toast.error("Account already exists — please sign in to accept this invitation");
        router.navigate({ to: "/login" });
        return;
      }
      toast.error(signErr.message);
      return;
    }
    toast.success("Check your email to verify, then return to this link.");
  };

  return (
    <AuthScene>
      <Card className="w-full max-w-md glass-strong border-white/60 animate-scale-in">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt={branding.name}
                className="h-10 w-10 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-md gradient-primary text-primary-foreground font-bold">
                {branding.mark}
              </div>
            )}
            <span className="font-semibold">{branding.name}</span>
          </div>
          <CardTitle className="text-2xl text-gradient">Accept your invitation</CardTitle>
          <CardDescription>Set up your account to access the workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking up your invitation…
            </div>
          )}

          {!isLoading && (error || !invite?.ok) && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <div className="font-medium text-destructive">Invitation not valid</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {invite?.error ??
                    error?.message ??
                    "This invitation may have expired or already been used."}
                </div>
                <Link
                  to="/login"
                  className="text-xs text-primary hover:underline mt-2 inline-block"
                >
                  Go to sign in
                </Link>
              </div>
            </div>
          )}

          {invite?.ok && !accepted && (
            <>
              <div className="rounded-md bg-accent/40 border border-border p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{invite.email}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {invite.role}
                  </Badge>
                  {invite.firm_name && <Badge variant="secondary">{invite.firm_name}</Badge>}
                </div>
              </div>

              {/* Role-aware helper: tells the invitee exactly what they unlock */}
              <RoleHelper role={invite.role ?? "employee"} firmName={invite.firm_name ?? null} />

              {user ? (
                user.email?.toLowerCase() === invite.email?.toLowerCase() ? (
                  <Button
                    onClick={acceptNow}
                    className="w-full gradient-primary text-primary-foreground focus-ring-auth"
                  >
                    Accept invitation
                  </Button>
                ) : (
                  <div className="text-sm text-muted-foreground" role="alert">
                    You are signed in as <b>{user.email}</b>, but this invitation is for{" "}
                    <b>{invite.email}</b>.{" "}
                    <button
                      onClick={() => supabase.auth.signOut()}
                      className="text-primary hover:underline focus-ring-auth rounded-sm"
                    >
                      Sign out
                    </button>{" "}
                    and try again.
                  </div>
                )
              ) : (
                <form onSubmit={onSignUp} className="space-y-3" aria-label="Create your account">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={invite.email}
                      disabled
                      aria-readonly="true"
                      className="bg-background/60 dark:bg-background/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Choose a password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                      autoFocus
                      aria-required="true"
                      aria-describedby="pw-help"
                      className="bg-background/70 dark:bg-background/40 focus-ring-auth"
                    />
                    <span id="pw-help" className="sr-only">
                      Use at least 8 characters.
                    </span>
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    aria-disabled={submitting}
                    className="w-full gradient-primary text-primary-foreground focus-ring-auth"
                  >
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    {submitting ? "Creating account…" : "Create account & accept"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Already have an account?{" "}
                    <Link
                      to="/login"
                      className="text-primary hover:underline focus-ring-auth rounded-sm"
                    >
                      Sign in
                    </Link>{" "}
                    instead, then revisit this link.
                  </p>
                </form>
              )}
            </>
          )}

          {accepted && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Invitation accepted! Redirecting…
            </div>
          )}
        </CardContent>
      </Card>
    </AuthScene>
  );
}

function RoleHelper({ role, firmName }: { role: string; firmName: string | null }) {
  const map: Record<string, { title: string; bullets: string[] }> = {
    super_admin: {
      title: "As a Super Admin you'll get:",
      bullets: [
        "Full workspace control",
        "User, role & firm management",
        "Billing, branding & audit log access",
      ],
    },
    admin: {
      title: "As an Admin you'll get:",
      bullets: [
        "User & firm management",
        "Reports & workflow oversight",
        "Workflow oversight across teams",
      ],
    },
    hr_manager: {
      title: "As an HR Manager you'll get:",
      bullets: ["Team directory & roles", "Time logs & attendance", "Onboarding & invitations"],
    },
    employee: {
      title: "As an Employee you'll get:",
      bullets: [
        "Your assigned tasks & reviews",
        "Time tracking & petty cash entries",
        "Internal docs and messages",
      ],
    },
    client: {
      title: "As a Client you'll get:",
      bullets: [
        firmName ? `${firmName} portal access` : "Your firm portal access",
        "Your tasks, messages & documents",
        "Status updates — no internal data",
      ],
    },
  };
  const cfg = map[role] ?? map.employee;
  return (
    <div
      className="rounded-xl border border-white/60 bg-white/65 p-3 text-xs text-foreground/85 leading-relaxed"
      role="note"
      aria-label="What this invitation unlocks"
    >
      <div className="font-semibold text-foreground mb-1">{cfg.title}</div>
      <ul className="space-y-0.5 list-disc list-inside marker:text-primary">
        {cfg.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}
