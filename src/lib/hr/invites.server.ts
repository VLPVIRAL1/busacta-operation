// Server-only invite/password-reset helpers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolvePasswordResetUrl } from "@/lib/shared/request-origin.server";

const THROTTLE_SECONDS = 60;

export type InviteKind = "invite" | "recovery";

export type ResendResult = {
  ok: boolean;
  email: string;
  kind: InviteKind;
  /** Magic link returned by Supabase auth admin — for dev surfaces only. */
  action_link?: string | null;
  /** Reason for failure (throttle / missing). */
  reason?: string;
};

export async function resendEmployeeInviteServer(args: {
  profileId: string;
  kind: InviteKind;
  actorId: string;
}): Promise<ResendResult> {
  const { profileId, kind, actorId } = args;

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, last_invite_sent_at, status")
    .eq("id", profileId)
    .maybeSingle();

  if (profErr) throw profErr;
  if (!profile) return { ok: false, email: "", kind, reason: "Employee not found" };
  if (!profile.email)
    return { ok: false, email: "", kind, reason: "Employee has no email on file" };

  // Throttle check
  if (profile.last_invite_sent_at) {
    const lastMs = new Date(profile.last_invite_sent_at as string).getTime();
    const ageSec = (Date.now() - lastMs) / 1000;
    if (ageSec < THROTTLE_SECONDS) {
      return {
        ok: false,
        email: profile.email as string,
        kind,
        reason: `Please wait ${Math.ceil(THROTTLE_SECONDS - ageSec)}s before resending`,
      };
    }
  }

  let actionLink: string | null = null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: kind === "invite" ? "invite" : "recovery",
      email: profile.email as string,
      options: { redirectTo: resolvePasswordResetUrl() },
    });
    if (error) throw error;
    actionLink = data?.properties?.action_link ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, email: profile.email as string, kind, reason: msg };
  }

  await supabaseAdmin
    .from("profiles")
    .update({ last_invite_sent_at: new Date().toISOString() } as never)
    .eq("id", profileId);

  return { ok: true, email: profile.email as string, kind, action_link: actionLink };
}

function randomPassword(len = 16) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%"[b % 60],
  ).join("");
}

export type TempPasswordResult = {
  ok: boolean;
  email: string;
  password?: string;
  reason?: string;
};

export async function generateTempPasswordServer(args: {
  profileId: string;
  actorId: string;
}): Promise<TempPasswordResult> {
  const { profileId, actorId } = args;

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", profileId)
    .maybeSingle();

  if (profErr) throw profErr;
  if (!profile) return { ok: false, email: "", reason: "Employee not found" };
  if (!profile.email) return { ok: false, email: "", reason: "Employee has no email on file" };

  const password = randomPassword();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(profileId, { password });
  if (error) return { ok: false, email: profile.email as string, reason: error.message };

  return { ok: true, email: profile.email as string, password };
}
