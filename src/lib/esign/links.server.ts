/**
 * Side-effect-free signing-link minting. Returns a fresh `/sign/<token>`
 * URL for a recipient without sending email, writing audit rows, or
 * touching `notified_at`/`last_reminder_at`. Used by the envelope detail
 * page's plain "Copy link" affordance so an operator can grab the URL
 * hours later without re-firing reminders.
 */
import { SignJWT } from "jose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function mintRecipientSigningLink(
  envelopeId: string,
  recipientId: string,
  origin: string,
): Promise<{ recipient_id: string; email: string; url: string }> {
  const { data: env, error: envErr } = await supabaseAdmin
    .from("esign_envelopes")
    .select("id, status, envelope_secret, expires_at")
    .eq("id", envelopeId)
    .maybeSingle();
  if (envErr) throw new Error(envErr.message);
  if (!env) throw new Error("Envelope not found");
  if (env.status === "draft") {
    throw new Error("Envelope has not been sent yet");
  }
  if (env.status === "voided" || env.status === "expired") {
    throw new Error(`Envelope is ${env.status}`);
  }

  const { data: rcp, error: rcpErr } = await supabaseAdmin
    .from("esign_recipients")
    .select("id, email, role, status, envelope_id")
    .eq("id", recipientId)
    .maybeSingle();
  if (rcpErr) throw new Error(rcpErr.message);
  if (!rcp || rcp.envelope_id !== envelopeId) throw new Error("Recipient not found");
  if (rcp.role === "cc") throw new Error("CC recipients do not have signing links");

  const secret = env.envelope_secret as unknown;
  const secretKey =
    secret instanceof Uint8Array ? secret : new Uint8Array(Buffer.from(secret as never));
  const exp = Math.floor(new Date(env.expires_at as string).getTime() / 1000);
  const token = await new SignJWT({ env: envelopeId, rcp: rcp.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secretKey);

  return {
    recipient_id: rcp.id,
    email: rcp.email as string,
    url: `${origin.replace(/\/+$/, "")}/sign/${token}`,
  };
}
