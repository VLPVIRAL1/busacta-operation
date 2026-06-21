/**
 * Public signer-portal server helpers. All access is gated by a signed JWT
 * minted by `sendEnvelopeServer` — these helpers do NOT require an
 * authenticated Supabase session, so callers (the /sign/$token route) are
 * unauthenticated end-users.
 */
import { jwtVerify } from "jose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sealEnvelope } from "./seal.server";
import {
  fieldOptions,
  fieldConditional,
  isFieldVisible,
  validateFieldValue,
  type FieldType,
} from "./schemas";

async function trySealEnvelope(envelopeId: string): Promise<void> {
  try {
    await sealEnvelope(envelopeId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[esign:seal] failed", envelopeId, msg);
    try {
      await supabaseAdmin.from("esign_audit_log").insert({
        envelope_id: envelopeId,
        event: "envelope_completed",
        metadata_json: { seal_error: msg },
      });
    } catch {
      /* swallow */
    }
  }
}

export type SignerSession = {
  envelope: {
    id: string;
    title: string;
    status: string;
    message: string | null;
    routing_mode: string;
    current_node: number;
    expires_at: string;
  };
  recipient: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    status: string;
    routing_order: number;
    color_hex: string;
    completed_at: string | null;
  };
  documents: Array<{
    id: string;
    name: string;
    order_index: number;
    page_count: number | null;
    source_path: string;
    signed_url: string;
  }>;
  fields: Array<{
    id: string;
    document_id: string;
    page_index: number;
    field_type: string;
    x_pt: number;
    y_pt: number;
    width_pt: number;
    height_pt: number;
    is_required: boolean;
    default_value: string | null;
    options_json: string | null;
    conditional_json: string | null;
    tab_order: number | null;
    existing_value_text: string | null;
    existing_value_image_path: string | null;
    existing_value_image_url: string | null;
  }>;
  /** All recipients on the envelope, ordered by routing_order. Used to render
   *  the multi-signer progress strip on the signing screen. */
  all_recipients: Array<{
    id: string;
    full_name: string;
    email: string;
    role: string;
    status: string;
    routing_order: number;
    color_hex: string;
    completed_at: string | null;
  }>;
  /** Audit-log events for this envelope, oldest first. Surfaced on the
   *  signing screen so the current signer can see the trail of activity.
   *  metadata_json is stringified for safe serialization across the RPC. */
  audit_log: Array<{
    id: string;
    event: string;
    actor_email: string | null;
    recipient_id: string | null;
    created_at: string;
    metadata_json: string | null;
  }>;

  /** True when this recipient's turn has arrived (parallel = always true). */
  is_active: boolean;
};

type DecodedToken = { env: string; rcp: string };

async function decodeToken(token: string): Promise<DecodedToken> {
  // We don't know the envelope yet — fetch its secret first, then verify.
  // To do that without a verified payload, we read the JWT header+payload
  // without checking the signature, then re-verify with the secret.
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
  const json = JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
  if (typeof json.env !== "string" || typeof json.rcp !== "string") {
    throw new Error("Invalid token payload");
  }
  return { env: json.env, rcp: json.rcp };
}

async function verifyToken(token: string): Promise<DecodedToken> {
  const claims = await decodeToken(token);
  const { data: env, error } = await supabaseAdmin
    .from("esign_envelopes")
    .select("envelope_secret")
    .eq("id", claims.env)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!env) throw new Error("Envelope not found");
  const secretKey = new Uint8Array(Buffer.from(env.envelope_secret));
  await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
  return claims;
}

async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from("esign-source")
    .createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

async function signatureSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from("esign-signatures")
    .createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function loadSignerSession(token: string): Promise<SignerSession> {
  const { env: envelopeId, rcp: recipientId } = await verifyToken(token);

  const [envRes, rcpRes, docsRes, fieldsRes, valuesRes, allRcpRes, auditRes] = await Promise.all([
    supabaseAdmin
      .from("esign_envelopes")
      .select("id, title, status, message, routing_mode, current_node, expires_at")
      .eq("id", envelopeId)
      .maybeSingle(),
    supabaseAdmin
      .from("esign_recipients")
      .select("id, full_name, email, role, status, routing_order, color_hex, completed_at")
      .eq("id", recipientId)
      .eq("envelope_id", envelopeId)
      .maybeSingle(),
    supabaseAdmin
      .from("esign_documents")
      .select("id, name, order_index, page_count, source_path")
      .eq("envelope_id", envelopeId)
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("esign_fields")
      .select(
        "id, document_id, page_index, field_type, x_pt, y_pt, width_pt, height_pt, is_required, default_value, options_json, conditional_json, tab_order",
      )
      .eq("envelope_id", envelopeId)
      .eq("recipient_id", recipientId),
    supabaseAdmin
      .from("esign_field_values")
      .select("field_id, value_text, value_image_path")
      .eq("envelope_id", envelopeId)
      .eq("recipient_id", recipientId),
    supabaseAdmin
      .from("esign_recipients")
      .select("id, full_name, email, role, status, routing_order, color_hex, completed_at")
      .eq("envelope_id", envelopeId)
      .order("routing_order", { ascending: true }),
    supabaseAdmin
      .from("esign_audit_log")
      .select("id, event, actor_email, recipient_id, occurred_at, metadata_json")
      .eq("envelope_id", envelopeId)
      .order("occurred_at", { ascending: true })
      .limit(200),
  ]);

  if (envRes.error) throw new Error(envRes.error.message);
  if (rcpRes.error) throw new Error(rcpRes.error.message);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (fieldsRes.error) throw new Error(fieldsRes.error.message);
  if (valuesRes.error) throw new Error(valuesRes.error.message);
  if (!envRes.data) throw new Error("Envelope not found");
  if (!rcpRes.data) throw new Error("Recipient not found");

  if (envRes.data.status === "voided") throw new Error("Envelope is voided");
  if (envRes.data.status === "expired") throw new Error("Envelope expired");
  if (new Date(envRes.data.expires_at).getTime() < Date.now()) {
    throw new Error("Signing link expired");
  }

  // First-view audit (only once)
  if (!rcpRes.data.completed_at) {
    await supabaseAdmin
      .from("esign_recipients")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", recipientId)
      .is("viewed_at", null);
    await supabaseAdmin.from("esign_audit_log").insert({
      envelope_id: envelopeId,
      recipient_id: recipientId,
      event: "document_viewed",
      actor_email: rcpRes.data.email,
    });
  }

  const docs = await Promise.all(
    (docsRes.data ?? []).map(async (d) => ({
      id: d.id,
      name: d.name,
      order_index: d.order_index,
      page_count: d.page_count,
      source_path: d.source_path,
      signed_url: await signedUrl(d.source_path),
    })),
  );

  const valueMap = new Map((valuesRes.data ?? []).map((v) => [v.field_id, v]));
  const fields = await Promise.all(
    (fieldsRes.data ?? []).map(async (f) => {
      const existing = valueMap.get(f.id);
      let imgUrl: string | null = null;
      if (existing?.value_image_path) {
        try {
          imgUrl = await signatureSignedUrl(existing.value_image_path);
        } catch {
          imgUrl = null;
        }
      }
      return {
        id: f.id,
        document_id: f.document_id,
        page_index: f.page_index,
        field_type: f.field_type,
        x_pt: f.x_pt,
        y_pt: f.y_pt,
        width_pt: f.width_pt,
        height_pt: f.height_pt,
        is_required: f.is_required,
        default_value: f.default_value,
        options_json: f.options_json == null ? null : JSON.stringify(f.options_json),
        conditional_json: f.conditional_json == null ? null : JSON.stringify(f.conditional_json),
        tab_order: f.tab_order,
        existing_value_text: existing?.value_text ?? null,
        existing_value_image_path: existing?.value_image_path ?? null,
        existing_value_image_url: imgUrl,
      };
    }),
  );

  const isActive =
    envRes.data.routing_mode === "parallel" ||
    rcpRes.data.routing_order <= envRes.data.current_node;

  return {
    envelope: envRes.data,
    recipient: rcpRes.data,
    documents: docs,
    fields,
    all_recipients: (allRcpRes.data ?? []).map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      role: r.role,
      status: r.status,
      routing_order: r.routing_order,
      color_hex: r.color_hex,
      completed_at: r.completed_at,
    })),
    audit_log: (auditRes.data ?? []).map((a) => ({
      id: a.id,
      event: a.event,
      actor_email: a.actor_email,
      recipient_id: a.recipient_id,
      created_at: a.occurred_at,
      metadata_json: a.metadata_json == null ? null : JSON.stringify(a.metadata_json),
    })),
    is_active: isActive,
  };
}

export type SubmittedField = {
  field_id: string;
  value_text?: string | null;
  /** dataURL: "data:image/png;base64,..." */
  value_image_data_url?: string | null;
};

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid image data URL");
  return { mime: m[1], bytes: new Uint8Array(Buffer.from(m[2], "base64")) };
}

export async function submitSignerValues(
  token: string,
  values: SubmittedField[],
  meta: { user_agent: string | null; ip: string | null },
): Promise<{ ok: true; envelope_status: string } | { ok: false; errors: string[] }> {
  const { env: envelopeId, rcp: recipientId } = await verifyToken(token);

  const { data: env } = await supabaseAdmin
    .from("esign_envelopes")
    .select("status, routing_mode, current_node")
    .eq("id", envelopeId)
    .maybeSingle();
  if (!env) return { ok: false, errors: ["Envelope not found"] };
  if (env.status !== "sent" && env.status !== "in_progress") {
    return { ok: false, errors: [`Envelope is ${env.status}`] };
  }

  const { data: rcp } = await supabaseAdmin
    .from("esign_recipients")
    .select("id, full_name, email, routing_order, status, completed_at")
    .eq("id", recipientId)
    .maybeSingle();
  if (!rcp) return { ok: false, errors: ["Recipient not found"] };
  if (rcp.completed_at) {
    return { ok: false, errors: ["You have already signed this envelope"] };
  }

  if (env.routing_mode === "sequential" && rcp.routing_order > env.current_node) {
    return { ok: false, errors: ["It is not yet your turn to sign"] };
  }

  // Load this recipient's fields to validate required coverage + rules.
  const { data: fields, error: fErr } = await supabaseAdmin
    .from("esign_fields")
    .select("id, field_type, is_required, options_json, conditional_json")
    .eq("envelope_id", envelopeId)
    .eq("recipient_id", recipientId);
  if (fErr) throw new Error(fErr.message);

  const valueByField = new Map(values.map((v) => [v.field_id, v]));

  // Resolver for conditional source values: uses incoming submission first,
  // falling back to default/empty.
  const resolve = (sourceId: string) => {
    const submitted = valueByField.get(sourceId);
    if (submitted?.value_image_data_url) return "true";
    return submitted?.value_text ?? "";
  };

  const errors: string[] = [];
  for (const f of fields ?? []) {
    const cond = f.conditional_json
      ? (fieldConditional.safeParse(f.conditional_json).data ?? null)
      : null;
    const opts = f.options_json ? (fieldOptions.safeParse(f.options_json).data ?? null) : null;
    const visible = isFieldVisible(cond, resolve);
    const v = valueByField.get(f.id);
    const isImg = f.field_type === "signature" || f.field_type === "initials";
    const isIdDoc = f.field_type === "signer_id_document";

    if (isImg || isIdDoc) {
      if (visible && f.is_required && !v?.value_image_data_url) {
        errors.push(isIdDoc ? "Government ID upload required" : `${f.field_type} required`);
      }
      continue;
    }

    const err = validateFieldValue(
      f.field_type as FieldType,
      f.is_required,
      visible,
      v?.value_text,
      opts,
    );
    if (err) errors.push(err);
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const fieldTypeMap = new Map((fields ?? []).map((f) => [f.id, f.field_type]));

  // Persist values (one row per field).
  for (const v of values) {
    const ftype = fieldTypeMap.get(v.field_id);
    if (!ftype) continue;
    let imagePath: string | null = null;
    if (v.value_image_data_url) {
      const { bytes, mime } = dataUrlToBytes(v.value_image_data_url);
      const isIdDoc = ftype === "signer_id_document";
      const bucket = isIdDoc ? "esign-id-docs" : "esign-signatures";
      // ID docs can be PDF or image; signatures are always image.
      const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : "jpg";
      const path = `${envelopeId}/${recipientId}/${v.field_id}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, bytes, { contentType: mime, upsert: true });
      if (upErr) throw new Error(upErr.message);
      imagePath = path;
    }
    const { error: vErr } = await supabaseAdmin.from("esign_field_values").upsert(
      {
        envelope_id: envelopeId,
        recipient_id: recipientId,
        field_id: v.field_id,
        value_text: v.value_text ?? null,
        value_image_path: imagePath,
        user_agent: meta.user_agent,
        ip: meta.ip ?? null,
      },
      { onConflict: "field_id" },
    );
    if (vErr) throw new Error(vErr.message);
  }

  // Mark recipient complete.
  await supabaseAdmin
    .from("esign_recipients")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      consented_at: new Date().toISOString(),
    })
    .eq("id", recipientId);

  await supabaseAdmin.from("esign_audit_log").insert({
    envelope_id: envelopeId,
    recipient_id: recipientId,
    event: "recipient_completed",
    actor_email: rcp.email,
    user_agent: meta.user_agent,
    ip: meta.ip ?? null,
    metadata_json: { field_count: values.length },
  });

  // Advance routing / complete envelope.
  let envelopeStatus: string = env.status;
  if (env.routing_mode === "sequential") {
    const { data: remaining } = await supabaseAdmin
      .from("esign_recipients")
      .select("id, routing_order")
      .eq("envelope_id", envelopeId)
      .in("role", ["signer", "approver"])
      .is("completed_at", null)
      .order("routing_order", { ascending: true });
    if (!remaining || remaining.length === 0) {
      await supabaseAdmin
        .from("esign_envelopes")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", envelopeId);
      await supabaseAdmin.from("esign_audit_log").insert({
        envelope_id: envelopeId,
        event: "envelope_completed",
      });
      await trySealEnvelope(envelopeId);
      envelopeStatus = "completed";
    } else {
      const next = remaining[0];
      await supabaseAdmin
        .from("esign_envelopes")
        .update({
          status: "in_progress",
          current_node: next.routing_order,
        })
        .eq("id", envelopeId);
      await supabaseAdmin
        .from("esign_recipients")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", next.id)
        .is("notified_at", null);
      envelopeStatus = "in_progress";
    }
  } else {
    // parallel
    const { data: remaining } = await supabaseAdmin
      .from("esign_recipients")
      .select("id")
      .eq("envelope_id", envelopeId)
      .in("role", ["signer", "approver"])
      .is("completed_at", null);
    if (!remaining || remaining.length === 0) {
      await supabaseAdmin
        .from("esign_envelopes")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", envelopeId);
      await supabaseAdmin.from("esign_audit_log").insert({
        envelope_id: envelopeId,
        event: "envelope_completed",
      });
      await trySealEnvelope(envelopeId);
      envelopeStatus = "completed";
    } else {
      await supabaseAdmin
        .from("esign_envelopes")
        .update({ status: "in_progress" })
        .eq("id", envelopeId);
      envelopeStatus = "in_progress";
    }
  }

  return { ok: true, envelope_status: envelopeStatus };
}

export async function declineSigningServer(
  token: string,
  reason: string,
  meta: { user_agent: string | null; ip: string | null },
) {
  const { env: envelopeId, rcp: recipientId } = await verifyToken(token);
  const { data: rcp } = await supabaseAdmin
    .from("esign_recipients")
    .select("email, completed_at")
    .eq("id", recipientId)
    .maybeSingle();
  if (!rcp) throw new Error("Recipient not found");
  if (rcp.completed_at) throw new Error("Already signed");

  await supabaseAdmin
    .from("esign_recipients")
    .update({
      status: "declined",
      decline_reason: reason,
      completed_at: new Date().toISOString(),
    })
    .eq("id", recipientId);

  await supabaseAdmin.from("esign_envelopes").update({ status: "declined" }).eq("id", envelopeId);

  await supabaseAdmin.from("esign_audit_log").insert({
    envelope_id: envelopeId,
    recipient_id: recipientId,
    event: "recipient_declined",
    actor_email: rcp.email,
    user_agent: meta.user_agent,
    ip: meta.ip ?? null,
    metadata_json: { reason },
  });
}
