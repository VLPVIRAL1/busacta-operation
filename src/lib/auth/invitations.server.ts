import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function lookupInvitationServer(token: string) {
  const { data, error } = await supabaseAdmin.rpc("lookup_invitation", { _token: token });
  if (error) throw error;
  return data as {
    ok: boolean;
    email?: string;
    role?: string;
    firm_name?: string | null;
    error?: string;
  };
}

export async function acceptInvitationServer(token: string, userId: string) {
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError) throw userError;
  const currentEmail = userData.user?.email;
  if (!currentEmail) return { ok: false, error: "missing_email" };

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("invitations")
    .select("id, email, role, firm_id, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();
  if (inviteError) throw inviteError;
  if (!invite) return { ok: false, error: "invitation_not_found" };
  if (invite.accepted_at) return { ok: false, error: "already_accepted" };
  if (new Date(invite.expires_at) < new Date()) return { ok: false, error: "expired" };
  if (invite.email.toLowerCase() !== currentEmail.toLowerCase())
    return { ok: false, error: "email_mismatch" };

  const { error: roleError } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: invite.role }, { onConflict: "user_id,role" });
  if (roleError) throw roleError;

  if (invite.firm_id) {
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ firm_id: invite.firm_id })
      .eq("id", userId);
    if (profileError) throw profileError;
  }

  const { error: acceptedError } = await supabaseAdmin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);
  if (acceptedError) throw acceptedError;

  return { ok: true, role: invite.role, firm_id: invite.firm_id };
}
