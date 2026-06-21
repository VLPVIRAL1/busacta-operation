import { createFileRoute, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/lib/auth/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * /portal layout — applies to every /portal/* route.
 *
 * Responsibilities:
 *   1. Force authentication (AuthGuard).
 *   2. Bounce internal employees (any non-client role) to /dashboard.
 *   3. Enforce provenance: only clients provisioned via the Firm Profile Hub
 *      (provisioned_via in 'firm_hub' or legacy 'legacy') may enter the
 *      portal. Self-signups or HR-provisioned accounts are signed out with
 *      an explanatory toast.
 *   4. Render <Outlet/> so child routes mount.
 *
 * Magic-link upload (/portal/upload/$token) is rendered bare.
 */
export const Route = createFileRoute("/portal")({
  component: PortalLayout,
  errorComponent: RouteErrorComponent,
});

function PortalLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  if (path.startsWith("/portal/upload/")) {
    return <Outlet />;
  }
  return (
    <AuthGuard allow={["client", "super_admin"]}>
      <ClientOnlyGate>
        <Outlet />
      </ClientOnlyGate>
    </AuthGuard>
  );
}

function ClientOnlyGate({ children }: { children: React.ReactNode }) {
  const { user, roles, loading } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    const list = roles ?? [];
    const isSuper = list.includes("super_admin");
    // Super admins can preview the portal from any account, so they skip both
    // the internal-role bounce and the client provenance check below (they have
    // no client provisioning record, which would otherwise sign them out).
    if (isSuper) {
      setChecking(false);
      return;
    }
    const hasInternal = list.some((r) => r !== "client");
    if (hasInternal) {
      router.navigate({ to: "/global-dashboard" });
      return;
    }
    if (!user) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("provisioned_via")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const provenance = (data as { provisioned_via?: string } | null)?.provisioned_via ?? "legacy";
      const allowed =
        provenance === "firm_hub" || provenance === "legacy" || provenance === "direct_client_hub";
      if (error || !allowed) {
        toast.error("Portal access is by invitation only.", {
          description: "Contact your firm to be added as a client.",
        });
        await supabase.auth.signOut();
        router.navigate({ to: "/login" });
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, roles, user, router]);

  if (loading || checking) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading portal…
      </div>
    );
  }
  return <>{children}</>;
}
