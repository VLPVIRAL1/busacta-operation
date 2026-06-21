import { SignJWT } from "jose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSignerLinkEmail } from "./email.server";

type Recipient = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  routing_order: number;
};

type Field = {
  id: string;
  recipient_id: string;
  is_required: boolean;
};

export type SendResult =
  | { ok: true; links: Array<{ recipient_id: string; email: string; url: string }> }
  | { ok: false; errors: Array<{ field: string; message: string }> };

export async function sendEnvelopeServer(envelopeId: string, origin: string): Promise<SendResult> {
  const errors: Array<{ field: string; message: string }> = [];

  const { data: env, error: envErr } = await supabaseAdmin
    .from("esign_envelopes")
    .select("id, firm_id, status, envelope_secret, routing_mode, expires_at, title, message")
    .eq("id", envelopeId)
    .maybeSingle();
  if (envErr) throw new Error(envErr.message);
  if (!env) throw new Error("Document not found");
  if (env.status !== "draft") {
    return { ok: false, errors: [{ field: "status", message: "Document is not a draft" }] };
  }

  // Per-firm sender identity (optional). Falls back to platform defaults.
  let firmSenderName: string | null = null;
  let firmReplyTo: string | null = null;
  if (env.firm_id) {
    const { data: firm } = await supabaseAdmin
      .from("firms")
      .select("esign_sender_name, esign_reply_to")
      .eq("id", env.firm_id)
      .maybeSingle();
    firmSenderName = (firm?.esign_sender_name as string | null) ?? null;
    firmReplyTo = (firm?.esign_reply_to as string | null) ?? null;
  }

  const [docsRes, recRes, fldRes] = await Promise.all([
    supabaseAdmin.from("esign_documents").select("id").eq("envelope_id", envelopeId),
    supabaseAdmin
      .from("esign_recipients")
      .select("id, full_name, email, role, routing_order")
      .eq("envelope_id", envelopeId)
      .order("routing_order", { ascending: true }),
    supabaseAdmin
      .from("esign_fields")
      .select("id, recipient_id, is_required")
      .eq("envelope_id", envelopeId),
  ]);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (recRes.error) throw new Error(recRes.error.message);
  if (fldRes.error) throw new Error(fldRes.error.message);

  const documents = docsRes.data ?? [];
  const recipients = (recRes.data ?? []) as Recipient[];
  const fields = (fldRes.data ?? []) as Field[];

  if (documents.length === 0) {
    errors.push({ field: "documents", message: "At least one document required" });
  }
  const signers = recipients.filter((r) => r.role === "signer");
  if (signers.length === 0) {
    errors.push({ field: "recipients", message: "At least one signer required" });
  }
  for (const s of signers) {
    const hasField = fields.some((f) => f.recipient_id === s.id);
    if (!hasField) {
      errors.push({
        field: `recipient:${s.id}`,
        message: `${s.full_name} has no fields assigned`,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Mint JWTs per recipient and store hash in access_token_hash for revocation.
  const secret = env.envelope_secret as unknown as Uint8Array;
  const secretKey =
    secret instanceof Uint8Array ? secret : new Uint8Array(Buffer.from(secret as never));

  const links: Array<{ recipient_id: string; email: string; url: string }> = [];
  // Track which recipients to email immediately: parallel = all signers,
  // sequential = only the first one in routing order.
  const firstSignerId =
    env.routing_mode === "sequential" && signers.length > 0 ? signers[0].id : null;
  for (const rcp of recipients) {
    if (rcp.role === "cc") continue;
    const expSeconds = Math.floor(new Date(env.expires_at).getTime() / 1000);
    const token = await new SignJWT({ env: envelopeId, rcp: rcp.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expSeconds)
      .sign(secretKey);
    const url = `${origin.replace(/\/+$/, "")}/sign/${token}`;
    links.push({ recipient_id: rcp.id, email: rcp.email, url });

    const shouldNotifyNow = env.routing_mode === "parallel" || rcp.id === firstSignerId;

    await supabaseAdmin
      .from("esign_recipients")
      .update({
        token_expires_at: new Date(env.expires_at).toISOString(),
        notified_at: shouldNotifyNow ? new Date().toISOString() : null,
      })
      .eq("id", rcp.id);

    if (shouldNotifyNow) {
      try {
        await sendSignerLinkEmail({
          to: rcp.email,
          full_name: rcp.full_name,
          envelope_title: env.title as string,
          envelope_message: (env.message as string | null) ?? null,
          signing_url: url,
          is_reminder: false,
          sender_name: firmSenderName,
          reply_to: firmReplyTo,
        });
      } catch (e) {
        // Soft-fail: still return the link so the operator can copy + send.
        console.error("[esign] sendSignerLinkEmail failed", {
          recipient_id: rcp.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  await supabaseAdmin
    .from("esign_envelopes")
    .update({ status: "sent", current_node: 1 })
    .eq("id", envelopeId);

  await supabaseAdmin.from("esign_audit_log").insert([
    {
      envelope_id: envelopeId,
      event: "envelope_sent",
      metadata_json: { recipients: recipients.length },
    },
    ...links.map((l) => ({
      envelope_id: envelopeId,
      recipient_id: l.recipient_id,
      event: "recipient_notified" as const,
      metadata_json: { email: l.email },
    })),
  ]);

  return { ok: true, links };
}

export async function voidEnvelopeServer(envelopeId: string, reason: string) {
  const { data: env } = await supabaseAdmin
    .from("esign_envelopes")
    .select("status")
    .eq("id", envelopeId)
    .maybeSingle();
  if (!env) throw new Error("Document not found");
  if (env.status === "completed" || env.status === "voided") {
    throw new Error(`Document already ${env.status}`);
  }
  const { error } = await supabaseAdmin
    .from("esign_envelopes")
    .update({ status: "voided", voided_at: new Date().toISOString(), void_reason: reason })
    .eq("id", envelopeId);
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("esign_audit_log").insert({
    envelope_id: envelopeId,
    event: "envelope_voided",
    metadata_json: { reason },
  });
}

export async function getEnvelopeAuditServer(envelopeId: string) {
  const { data, error } = await supabaseAdmin
    .from("esign_audit_log")
    .select(
      "id, envelope_id, recipient_id, event, actor_email, actor_phone, user_agent, ip, metadata_json, occurred_at",
    )
    .eq("envelope_id", envelopeId)
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    envelope_id: r.envelope_id as string,
    recipient_id: (r.recipient_id ?? null) as string | null,
    event: r.event as string,
    actor_email: (r.actor_email ?? null) as string | null,
    actor_phone: (r.actor_phone ?? null) as string | null,
    user_agent: (r.user_agent ?? null) as string | null,
    ip: r.ip == null ? null : String(r.ip),
    metadata_json: JSON.stringify(r.metadata_json ?? {}),
    occurred_at: r.occurred_at as string,
  }));
}
