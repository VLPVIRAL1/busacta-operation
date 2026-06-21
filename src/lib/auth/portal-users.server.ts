// Server-only helpers for provisioning client portal users.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function createPortalUserServer(args: {
  contactId: string;
  email: string;
  password: string;
  fullName?: string | null;
  stream?: "cpa" | "direct";
}) {
  const { contactId, email, password, fullName, stream = "cpa" } = args;
  if (!email || !password) throw new Error("email and password are required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const admin = supabaseAdmin;

  // SECURITY GUARD: An email that already holds any non-client role on the
  // system cannot be portal-enabled. Portal users are for external clients only;
  // internal accounts must be created from HR Hub.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (existingProfile?.id) {
    const { data: existingRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", existingProfile.id);
    const nonClient = (existingRoles ?? []).some((r: any) => r.role && r.role !== "client");
    if (nonClient) {
      throw new Error(
        "This email is already provisioned as an internal user. Portal access is reserved for external clients only.",
      );
    }
  }

  // Try create; if user already exists, send a password update.
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? null, portal: true },
  });

  if (created.error) {
    // Fallback: find user by email and update password.
    if (!/already|exists|registered/i.test(created.error.message)) throw created.error;
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) throw list.error;
    const existing = list.data.users.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase(),
    );
    if (!existing) throw created.error;
    userId = existing.id;
    const upd = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (upd.error) throw upd.error;
  } else {
    userId = created.data.user?.id ?? null;
  }

  if (!userId) throw new Error("Failed to resolve user id");

  // Ensure 'client' role.
  const { error: roleErr } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "client" as never }, { onConflict: "user_id,role" });
  if (roleErr) throw roleErr;

  // Stamp provenance so the portal gate can verify origin. B2B firms use
  // `firm_hub`; B2C clients use `direct_client_hub` (per project memory).
  const provisioned_via = stream === "direct" ? "direct_client_hub" : "firm_hub";
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: email.toLowerCase(),
      full_name: fullName ?? null,
      provisioned_via,
      portal_enabled: true,
    } as never,
    { onConflict: "id" },
  );
  if (profileErr) throw profileErr;

  // Ensure the contact has portal_enabled = true on the correct stream table.
  const contactsTable = stream === "direct" ? "direct_client_contacts" : "firm_contacts";
  const { error: contactErr } = await admin
    .from(contactsTable)
    .update({ portal_enabled: true, email })
    .eq("id", contactId);
  if (contactErr) throw contactErr;

  return { ok: true, userId };
}
