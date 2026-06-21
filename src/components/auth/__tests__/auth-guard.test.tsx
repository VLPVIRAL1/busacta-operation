import { describe, it, expect } from "vitest";
import { decideAuthGuard, AUTH_GUARD_TIMEOUT_MS } from "../auth-guard";
import type { AppRole } from "@/lib/auth/auth-context";

/**
 * Regression coverage for the AuthGuard render-decision logic. The guard
 * itself touches Tanstack router + the Supabase context, so we test the
 * pure helper that drives every branch instead of mounting React.
 *
 * Guards against the "stuck on spinner" class of bug: any allowed role
 * with a hydrated user and loading=false MUST resolve to "render", and
 * a stuck loading state MUST eventually flip to "timeout".
 */

const FAKE_USER = { id: "u_1" };
const ESIGN_NEW_ROLES: AppRole[] = ["admin", "employee", "super_admin"];

describe("decideAuthGuard", () => {
  it("renders children once auth has hydrated for an allowed user", () => {
    expect(
      decideAuthGuard({
        loading: false,
        loadingTimedOut: false,
        user: FAKE_USER,
        hasAllowedRole: true,
        required: null,
      }),
    ).toEqual({ kind: "render" });
  });

  it("shows the spinner while loading and the timeout has not fired", () => {
    expect(
      decideAuthGuard({
        loading: true,
        loadingTimedOut: false,
        user: null,
        hasAllowedRole: false,
        required: null,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("flips to the timeout error state when loading stays true past the watchdog", () => {
    expect(AUTH_GUARD_TIMEOUT_MS).toBeGreaterThan(0);
    expect(
      decideAuthGuard({
        loading: true,
        loadingTimedOut: true,
        user: null,
        hasAllowedRole: false,
        required: null,
      }),
    ).toEqual({ kind: "timeout" });
  });

  it("redirects to /login when auth finished without a user", () => {
    expect(
      decideAuthGuard({
        loading: false,
        loadingTimedOut: false,
        user: null,
        hasAllowedRole: false,
        required: null,
      }),
    ).toEqual({ kind: "redirect-login" });
  });

  it("redirects to /access-denied when the user is missing a required role", () => {
    expect(
      decideAuthGuard({
        loading: false,
        loadingTimedOut: false,
        user: FAKE_USER,
        hasAllowedRole: false,
        required: ["super_admin"],
      }),
    ).toEqual({ kind: "redirect-denied", need: ["super_admin"] });
  });

  it.each(ESIGN_NEW_ROLES)(
    "renders /esign/envelopes/new for role %s without hanging the guard",
    (role) => {
      // Simulates the AuthGuard receiving a hydrated user that holds `role`
      // on a page that allows that role — hasAllowedRole is computed
      // upstream and must produce a `render` decision.
      const decision = decideAuthGuard({
        loading: false,
        loadingTimedOut: false,
        user: { ...FAKE_USER, role },
        hasAllowedRole: true,
        required: ESIGN_NEW_ROLES,
      });
      expect(decision.kind).toBe("render");
    },
  );
});
