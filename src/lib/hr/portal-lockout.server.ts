// Server-only helpers that enforce + verify that a given user cannot access
// the Client Portal. Used after createEmployee and reactivateEmployee.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LockoutResult = {
  ok: boolean;
  issues: string[];
};

/** Aggressively remove every portal-access vector for a user. */
export async function enforcePortalLockout(userId: string): Promise<void> {
  const admin = supabaseAdmin;

  // 1. Remove any 'client' role row.
  await admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", "client" as never);

  // 2. Ensure profiles.portal_enabled = false (defensive flag).
  await admin
    .from("profiles")
    .update({ portal_enabled: false } as never)
    .eq("id", userId);

  // 3. Disable any firm_contacts row that maps this user's email to a portal.
  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const email = (prof as { email?: string | null } | null)?.email?.toLowerCase();
    if (email) {
      await admin
        .from("firm_contacts")
        .update({ portal_enabled: false } as never)
        .ilike("email", email);
    }
  } catch (e) {
    console.warn("[portal-lockout] firm_contacts step failed:", e);
  }
}

/** Verify that no portal-access vector remains. Returns ok + list of issues. */
export async function verifyPortalLockout(userId: string): Promise<LockoutResult> {
  const admin = supabaseAdmin;
  const issues: string[] = [];

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if ((roles ?? []).some((r: any) => r.role === "client")) {
    issues.push("client role still present on user_roles");
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("email, portal_enabled")
    .eq("id", userId)
    .maybeSingle();
  if ((prof as any)?.portal_enabled === true) {
    issues.push("profiles.portal_enabled is true");
  }

  const email = (prof as { email?: string | null } | null)?.email?.toLowerCase();
  if (email) {
    const { data: contacts } = await admin
      .from("firm_contacts")
      .select("id, portal_enabled")
      .ilike("email", email);
    if ((contacts ?? []).some((c: any) => c.portal_enabled === true)) {
      issues.push("firm_contacts.portal_enabled is true for this email");
    }
  }

  return { ok: issues.length === 0, issues };
}
