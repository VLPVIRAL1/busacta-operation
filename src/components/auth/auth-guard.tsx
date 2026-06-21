import { type ReactNode, useEffect, useState } from "react";
import { useRouter, useLocation } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth/auth-context";
import { Loader2, AlertTriangle } from "lucide-react";
import { canAccess, requiredRolesFor, BYPASS_ACCESS } from "@/lib/routing/route-access";

export const AUTH_GUARD_TIMEOUT_MS = 8000;

/**
 * Pure decision helper, exported for unit tests. Returns what the guard
 * should render this tick.
 */
export type AuthGuardDecision =
  | { kind: "loading" }
  | { kind: "timeout" }
  | { kind: "redirect-login" }
  | { kind: "redirect-denied"; need: string[] }
  | { kind: "render" };

export function decideAuthGuard(input: {
  loading: boolean;
  loadingTimedOut: boolean;
  user: unknown;
  hasAllowedRole: boolean;
  required: AppRole[] | null;
}): AuthGuardDecision {
  if (input.loading) {
    return input.loadingTimedOut ? { kind: "timeout" } : { kind: "loading" };
  }
  if (!input.user) return { kind: "redirect-login" };
  if (!input.hasAllowedRole) {
    return { kind: "redirect-denied", need: input.required ?? [] };
  }
  return { kind: "render" };
}

export function AuthGuard({ children, allow }: { children: ReactNode; allow?: Array<AppRole> }) {
  const { user, roles, loading } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  // BYPASS_ACCESS (env-controlled, default true) lets every authenticated user
  // reach every page during the validation phase. When flipped to false the
  // central matrix becomes authoritative and unauthorised users go to /access-denied.
  // super_admin always has full access regardless of per-route allow lists.
  const isSuperAdmin = (roles ?? []).includes("super_admin" as AppRole);
  const hasAllowedRole =
    BYPASS_ACCESS || isSuperAdmin
      ? true
      : (allow
          ? allow.length === 0 || (roles ?? []).some((r) => allow.includes(r as AppRole))
          : true) && canAccess((roles ?? []) as AppRole[], location.pathname);

  // Watchdog: if `loading` never flips false (e.g. AuthProvider stuck on
  // network call), surface a recoverable error after AUTH_GUARD_TIMEOUT_MS.
  useEffect(() => {
    if (!loading) {
      setLoadingTimedOut(false);
      return;
    }
    const t = setTimeout(() => setLoadingTimedOut(true), AUTH_GUARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.navigate({ to: "/login" });
      return;
    }
    if (!hasAllowedRole) {
      const matrixRoles = requiredRolesFor(location.pathname);
      const need = (matrixRoles ?? allow ?? []).join(",");
      router.navigate({ to: "/access-denied", search: { from: location.pathname, need } });
    }
  }, [user, loading, hasAllowedRole, router, location.pathname, allow]);

  const decision = decideAuthGuard({
    loading,
    loadingTimedOut,
    user,
    hasAllowedRole,
    required: requiredRolesFor(location.pathname) ?? allow ?? null,
  });

  const diag = import.meta.env.DEV ? (
    <AuthGuardDevPanel
      loading={loading}
      loadingTimedOut={loadingTimedOut}
      userId={(user as { id?: string } | null)?.id ?? null}
      roles={roles ?? []}
      bypass={BYPASS_ACCESS}
      hasAllowedRole={hasAllowedRole}
      pathname={location.pathname}
      allow={allow ?? null}
    />
  ) : null;

  if (decision.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {diag}
      </div>
    );
  }
  if (decision.kind === "timeout") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border bg-card p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <h2 className="text-lg font-semibold">We couldn't verify your session</h2>
          <p className="text-sm text-muted-foreground">
            The authentication check is taking longer than expected. Reload to try again, or sign
            back in if the problem persists.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
            <a
              href="/login"
              className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Go to login
            </a>
          </div>
        </div>
        {diag}
      </div>
    );
  }
  if (decision.kind === "redirect-login" || decision.kind === "redirect-denied") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {diag}
      </div>
    );
  }
  return (
    <>
      {children}
      {diag}
    </>
  );
}

function AuthGuardDevPanel(props: {
  loading: boolean;
  loadingTimedOut: boolean;
  userId: string | null;
  roles: AppRole[];
  bypass: boolean;
  hasAllowedRole: boolean;
  pathname: string;
  allow: AppRole[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="fixed bottom-3 right-3 z-[9999] text-xs font-mono">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border bg-background/90 px-2 py-1 shadow-sm text-muted-foreground hover:text-foreground"
          title="AuthGuard diagnostics (dev only)"
        >
          🛡 guard
        </button>
      ) : (
        <div className="rounded-md border bg-background/95 p-2 shadow-md w-72 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold">AuthGuard (dev)</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="px-1 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                ▾
              </button>
              <button
                type="button"
                className="px-1 text-muted-foreground hover:text-foreground"
                onClick={() => setDismissed(true)}
              >
                ✕
              </button>
            </div>
          </div>
          <Row k="loading" v={String(props.loading)} />
          <Row k="timedOut" v={String(props.loadingTimedOut)} />
          <Row k="user" v={props.userId ?? "null"} />
          <Row k="roles" v={props.roles.join(",") || "(none)"} />
          <Row k="BYPASS" v={String(props.bypass)} />
          <Row k="allowed" v={String(props.hasAllowedRole)} />
          <Row k="allow" v={props.allow?.join(",") ?? "(any)"} />
          <Row k="path" v={props.pathname} />
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-16 shrink-0">{k}</span>
      <span className="truncate">{v}</span>
    </div>
  );
}
