/**
 * Cron + manual reminder helpers for the e-signature module.
 *
 * Reminders mint a fresh signer link (same JWT shape as the initial send),
 * write a `reminder_sent` audit row, and bump `esign_envelopes.last_reminder_at`
 * so the next cron tick can debounce by `reminder_cadence_hours`.
 *
 * Expiry sweep moves `sent` / `in_progress` envelopes past `expires_at` to
 * `expired` and logs `envelope_expired`.
 */
import { SignJWT } from "jose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSignerLinkEmail } from "./email.server";

type SignerLink = { recipient_id: string; email: string; url: string };

async function mintSignerLink(
  envelopeId: string,
  envelopeSecret: Uint8Array,
  expiresAt: string,
  recipient: { id: string; email: string },
  origin: string,
): Promise<SignerLink> {
  const exp = Math.floor(new Date(expiresAt).getTime() / 1000);
  const token = await new SignJWT({ env: envelopeId, rcp: recipient.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(envelopeSecret);
  return {
    recipient_id: recipient.id,
    email: recipient.email,
    url: `${origin.replace(/\/+$/, "")}/sign/${token}`,
  };
}

function toSecretBytes(secret: unknown): Uint8Array {
  if (secret instanceof Uint8Array) return secret;
  return new Uint8Array(Buffer.from(secret as never));
}

type FirmSender = { sender_name: string | null; reply_to: string | null };

async function fetchFirmSender(firmId: string | null | undefined): Promise<FirmSender> {
  if (!firmId) return { sender_name: null, reply_to: null };
  const { data } = await supabaseAdmin
    .from("firms")
    .select("esign_sender_name, esign_reply_to")
    .eq("id", firmId)
    .maybeSingle();
  return {
    sender_name: (data?.esign_sender_name as string | null) ?? null,
    reply_to: (data?.esign_reply_to as string | null) ?? null,
  };
}

/**
 * Send (or resend) a reminder for a single recipient. Used by both the
 * "Resend now" button and the cron sweep. Idempotent at the audit level —
 * each call appends one `reminder_sent` row.
 */
export async function sendRecipientReminder(
  envelopeId: string,
  recipientId: string,
  origin: string,
): Promise<SignerLink> {
  const { data: env, error: envErr } = await supabaseAdmin
    .from("esign_envelopes")
    .select("id, firm_id, status, envelope_secret, expires_at, title, message")
    .eq("id", envelopeId)
    .maybeSingle();
  if (envErr) throw new Error(envErr.message);
  if (!env) throw new Error("Document not found");
  if (env.status !== "sent" && env.status !== "in_progress") {
    throw new Error(`Document is ${env.status}; reminders only apply to active documents`);
  }

  const { data: rcp, error: rcpErr } = await supabaseAdmin
    .from("esign_recipients")
    .select("id, email, full_name, role, status, envelope_id")
    .eq("id", recipientId)
    .maybeSingle();
  if (rcpErr) throw new Error(rcpErr.message);
  if (!rcp || rcp.envelope_id !== envelopeId) throw new Error("Recipient not found");
  if (rcp.role === "cc") throw new Error("Cannot remind a CC recipient");
  if (rcp.status === "completed" || rcp.status === "declined") {
    throw new Error(`Recipient already ${rcp.status}`);
  }

  const link = await mintSignerLink(
    envelopeId,
    toSecretBytes(env.envelope_secret),
    env.expires_at as string,
    { id: rcp.id, email: rcp.email },
    origin,
  );

  const now = new Date().toISOString();
  await Promise.all([
    supabaseAdmin.from("esign_recipients").update({ notified_at: now }).eq("id", rcp.id),
    supabaseAdmin.from("esign_envelopes").update({ last_reminder_at: now }).eq("id", envelopeId),
    supabaseAdmin.from("esign_audit_log").insert({
      envelope_id: envelopeId,
      recipient_id: rcp.id,
      event: "reminder_sent",
      metadata_json: { email: rcp.email, full_name: rcp.full_name },
    }),
  ]);

  try {
    const sender = await fetchFirmSender(env.firm_id as string | null);
    await sendSignerLinkEmail({
      to: rcp.email,
      full_name: rcp.full_name as string | null,
      envelope_title: env.title as string,
      envelope_message: (env.message as string | null) ?? null,
      signing_url: link.url,
      is_reminder: true,
      sender_name: sender.sender_name,
      reply_to: sender.reply_to,
    });
  } catch (e) {
    console.error("[esign] reminder email failed", {
      recipient_id: rcp.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return link;
}

export type RemindersSweepResult = {
  scanned: number;
  sent: number;
  links: SignerLink[];
};

/**
 * Cron sweep: pick active envelopes whose next reminder is due, then for each
 * one notify every still-pending non-CC recipient in routing order
 * (parallel envelopes get them all; sequential gets the current node only).
 */
export async function runReminderSweep(origin: string): Promise<RemindersSweepResult> {
  const nowIso = new Date().toISOString();

  const { data: envs, error: envErr } = await supabaseAdmin
    .from("esign_envelopes")
    .select(
      "id, firm_id, status, envelope_secret, expires_at, routing_mode, current_node, reminder_cadence_hours, last_reminder_at, created_at, title, message",
    )
    .in("status", ["sent", "in_progress"])
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(200);
  if (envErr) throw new Error(envErr.message);

  const due = (envs ?? []).filter((e) => {
    const cadenceMs = (e.reminder_cadence_hours as number) * 3_600_000;
    const last = (e.last_reminder_at as string | null) ?? (e.created_at as string);
    return Date.now() - new Date(last).getTime() >= cadenceMs;
  });

  let sent = 0;
  const links: SignerLink[] = [];

  for (const env of due) {
    const { data: recs, error: rErr } = await supabaseAdmin
      .from("esign_recipients")
      .select("id, email, full_name, role, status, routing_order")
      .eq("envelope_id", env.id)
      .order("routing_order", { ascending: true });
    if (rErr) continue;

    const pending = (recs ?? []).filter(
      (r) => r.role !== "cc" && r.status !== "completed" && r.status !== "declined",
    );
    if (pending.length === 0) continue;

    const targets =
      env.routing_mode === "sequential"
        ? pending.filter((r) => r.routing_order === env.current_node)
        : pending;
    if (targets.length === 0) continue;

    const secret = toSecretBytes(env.envelope_secret);
    const sender = await fetchFirmSender(env.firm_id as string | null);
    const auditRows: Array<Record<string, unknown>> = [];

    for (const t of targets) {
      const link = await mintSignerLink(
        env.id as string,
        secret,
        env.expires_at as string,
        { id: t.id as string, email: t.email as string },
        origin,
      );
      links.push(link);
      auditRows.push({
        envelope_id: env.id as string,
        recipient_id: t.id as string,
        event: "reminder_sent",
        metadata_json: { email: t.email, full_name: t.full_name, source: "cron" },
      });
      await supabaseAdmin.from("esign_recipients").update({ notified_at: nowIso }).eq("id", t.id);
      try {
        await sendSignerLinkEmail({
          to: t.email as string,
          full_name: (t.full_name as string | null) ?? null,
          envelope_title: env.title as string,
          envelope_message: (env.message as string | null) ?? null,
          signing_url: link.url,
          is_reminder: true,
          sender_name: sender.sender_name,
          reply_to: sender.reply_to,
        });
      } catch (e) {
        console.error("[esign] cron reminder email failed", {
          recipient_id: t.id,
          envelope_id: env.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      sent++;
    }

    if (auditRows.length > 0) {
      await supabaseAdmin.from("esign_audit_log").insert(auditRows as never);
    }
    await supabaseAdmin
      .from("esign_envelopes")
      .update({ last_reminder_at: nowIso })
      .eq("id", env.id);
  }

  return { scanned: due.length, sent, links };
}

export type ExpirySweepResult = { scanned: number; expired: number; ids: string[] };

export async function runExpirySweep(): Promise<ExpirySweepResult> {
  const nowIso = new Date().toISOString();
  const { data: envs, error } = await supabaseAdmin
    .from("esign_envelopes")
    .select("id")
    .in("status", ["sent", "in_progress"])
    .lt("expires_at", nowIso)
    .limit(500);
  if (error) throw new Error(error.message);

  const ids = (envs ?? []).map((e) => e.id as string);
  if (ids.length === 0) return { scanned: 0, expired: 0, ids: [] };

  await supabaseAdmin.from("esign_envelopes").update({ status: "expired" }).in("id", ids);

  await supabaseAdmin.from("esign_audit_log").insert(
    ids.map((envelope_id) => ({
      envelope_id,
      event: "envelope_expired" as const,
      metadata_json: { source: "cron" },
    })),
  );

  return { scanned: ids.length, expired: ids.length, ids };
}

export async function updateEnvelopeProjectServer(
  envelopeId: string,
  projectId: string | null,
): Promise<void> {
  // If a project is supplied, enforce same-firm.
  if (projectId) {
    const [envRes, projRes] = await Promise.all([
      supabaseAdmin.from("esign_envelopes").select("firm_id").eq("id", envelopeId).maybeSingle(),
      supabaseAdmin.from("projects").select("firm_id").eq("id", projectId).maybeSingle(),
    ]);
    if (envRes.error) throw new Error(envRes.error.message);
    if (!envRes.data) throw new Error("Document not found");
    if (projRes.error) throw new Error(projRes.error.message);
    if (!projRes.data) throw new Error("Project not found");
    if (projRes.data.firm_id !== envRes.data.firm_id) {
      throw new Error("Project belongs to a different firm");
    }
  }

  const { error } = await supabaseAdmin
    .from("esign_envelopes")
    .update({ project_id: projectId })
    .eq("id", envelopeId);
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("esign_audit_log").insert({
    envelope_id: envelopeId,
    event: "project_updated",
    metadata_json: { project_id: projectId },
  });
}
