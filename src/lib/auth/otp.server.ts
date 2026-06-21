// Server-only OTP helpers. Generates 6-digit codes, hashes them, persists
// challenges with TTL/attempt limits, and dispatches via email (Resend) or
// WhatsApp (Meta Cloud API).
//
// All DB writes use the user-scoped Supabase client (passed in by the caller)
// so they go through RLS as the signed-in user. We never use the admin client
// for OTP work — codes are tied to a single user.
import { createHash, randomInt, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const CODE_TTL_SECONDS = 5 * 60;
const MAX_ATTEMPTS = 5;
const MIN_RESEND_SECONDS = 30;
const HOURLY_SEND_LIMIT = 5;

export type Channel = "email" | "sms" | "whatsapp";
export type Purpose = "login" | "enrollment";

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function maskDestination(channel: Channel, dest: string): string {
  if (channel === "email") {
    const [local, domain] = dest.split("@");
    if (!domain) return dest;
    const head = local.slice(0, 2);
    return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
  }
  // sms / whatsapp — show last 4 digits only
  const tail = dest.slice(-4);
  return `${"•".repeat(Math.max(1, dest.length - 4))}${tail}`;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  channel: Channel,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("otp_challenges")
    .select("created_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(HOURLY_SEND_LIMIT);
  if (error) return { ok: false, error: error.message };
  const rows = data ?? [];
  if (rows.length >= HOURLY_SEND_LIMIT) {
    return { ok: false, error: "Too many codes requested. Try again in an hour." };
  }
  if (rows.length > 0) {
    const last = new Date(rows[0].created_at).getTime();
    const since = (Date.now() - last) / 1000;
    if (since < MIN_RESEND_SECONDS) {
      return {
        ok: false,
        error: `Please wait ${Math.ceil(MIN_RESEND_SECONDS - since)}s before requesting another code.`,
      };
    }
  }
  return { ok: true };
}

export async function createChallenge(
  supabase: SupabaseClient,
  userId: string,
  channel: Channel,
  destination: string,
  purpose: Purpose,
): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  const code = generateCode();
  const { data, error } = await supabase
    .from("otp_challenges")
    .insert({
      user_id: userId,
      channel,
      destination,
      code_hash: hashCode(code),
      purpose,
      expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create challenge" };
  return { ok: true, id: data.id, code };
}

export async function verifyChallenge(
  supabase: SupabaseClient,
  userId: string,
  challengeId: string,
  code: string,
): Promise<
  | { ok: true; channel: Channel; purpose: Purpose; destination: string }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("otp_challenges")
    .select("id, channel, destination, code_hash, purpose, expires_at, consumed_at, attempts")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Code not found" };
  if (data.consumed_at) return { ok: false, error: "Code already used" };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, error: "Code expired" };
  if ((data.attempts ?? 0) >= MAX_ATTEMPTS) return { ok: false, error: "Too many attempts" };

  const matches = constantTimeEqual(hashCode(code), data.code_hash);

  if (!matches) {
    await supabase
      .from("otp_challenges")
      .update({ attempts: (data.attempts ?? 0) + 1 })
      .eq("id", challengeId);
    return { ok: false, error: "Invalid code" };
  }

  await supabase
    .from("otp_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challengeId);
  return {
    ok: true,
    channel: data.channel as Channel,
    purpose: data.purpose as Purpose,
    destination: data.destination,
  };
}

// ---------- Delivery ----------

export async function sendEmailCode(toEmail: string, code: string): Promise<void> {
  const { sendEmail } = await import("@/lib/email/send.server");

  // Render a minimal branded template.
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Inter,Arial,sans-serif;color:#0f172a">
    <table width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;padding:32px 16px">
      <tr><td align="center">
        <table width="100%" style="max-width:480px" cellspacing="0" cellpadding="0">
          <tr><td>
            <h1 style="font-size:20px;margin:0 0 8px">Your sign-in code</h1>
            <p style="margin:0 0 20px;color:#475569;font-size:14px">Use this code to finish signing in to BusAcTa Operations. It expires in 5 minutes.</p>
            <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f1f5f9;border-radius:12px;padding:18px 0;text-align:center">${code}</div>
            <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">If you didn't request this code, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  await sendEmail({
    to: toEmail,
    subject: "Your BusAcTa Operations sign-in code",
    html,
  });
}

export async function sendWhatsAppCode(toPhoneE164: string, code: string): Promise<void> {
  // Lazy-import to avoid pulling the admin client into the OTP bundle unnecessarily.
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/client.server");
  const { loginOtpMessage } = await import("@/lib/whatsapp/templates");
  await sendWhatsAppMessage(toPhoneE164, loginOtpMessage(code));
}

// Phone-based OTP is delivered over WhatsApp (Meta Cloud API). The legacy SMS
// path (Twilio via the Lovable connector gateway) has been removed; this thin
// wrapper keeps the "sms" channel working by routing it through WhatsApp.
export async function sendSmsCode(toPhoneE164: string, code: string): Promise<void> {
  await sendWhatsAppCode(toPhoneE164, code);
}
