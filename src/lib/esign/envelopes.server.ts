/**
 * Server-only helpers for the E-Signature module.
 * Imported only by *.functions.ts modules.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CreateEnvelopeInput, EnvelopeRow } from "./schemas";

export async function listEnvelopesServer(filter: {
  firm_id?: string;
  status?: string;
}): Promise<EnvelopeRow[]> {
  let q = supabaseAdmin
    .from("esign_envelopes")
    .select(
      "id, firm_id, project_id, title, status, routing_mode, expires_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter.firm_id) q = q.eq("firm_id", filter.firm_id);
  if (filter.status) q = q.eq("status", filter.status as never);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EnvelopeRow[];
}

export async function createEnvelopeServer(
  input: CreateEnvelopeInput & { created_by: string },
): Promise<string> {
  const expiresAt = new Date(Date.now() + input.expires_in_days * 24 * 3600 * 1000).toISOString();
  const target = input.target ?? null;
  const { data, error } = await supabaseAdmin
    .from("esign_envelopes")
    .insert({
      firm_id: input.firm_id,
      project_id: input.project_id ?? null,
      title: input.title,
      message: input.message ?? null,
      routing_mode: input.routing_mode,
      expires_at: expiresAt,
      reminder_cadence_hours: input.reminder_cadence_hours,
      created_by: input.created_by,
      target_kind: target?.kind ?? null,
      target_direct_client_id: target?.direct_client_id ?? null,
      target_profile_id: target?.profile_id ?? null,
      target_task_id: target?.task_id ?? null,
      target_organizer_deployment_id: target?.organizer_deployment_id ?? null,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("esign_audit_log").insert({
    envelope_id: data.id,
    event: "envelope_created",
    metadata_json: { title: input.title, target_kind: target?.kind ?? null },
  });
  return data.id;
}

export async function updateEnvelopeTargetServer(
  envelopeId: string,
  target: {
    kind: "direct_client" | "cpa" | "hr";
    direct_client_id?: string | null;
    profile_id?: string | null;
    task_id?: string | null;
    organizer_deployment_id?: string | null;
  },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("esign_envelopes")
    .update({
      target_kind: target.kind,
      target_direct_client_id: target.direct_client_id ?? null,
      target_profile_id: target.profile_id ?? null,
      target_task_id: target.task_id ?? null,
      target_organizer_deployment_id: target.organizer_deployment_id ?? null,
    } as never)
    .eq("id", envelopeId);
  if (error) throw new Error(error.message);
}

export async function listPageLayoutsServer(envelopeId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (supabaseAdmin as any).from("esign_page_layouts");
  const { data, error } = await tbl.select("*").eq("envelope_id", envelopeId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    envelope_id: string;
    document_id: string;
    page_index: number;
    recipient_id: string;
    mode: "manual" | "auto";
    orientation: "horizontal" | "vertical" | null;
    sequence_json: string[];
    origin_x_pt: number | null;
    origin_y_pt: number | null;
    spacing_pt: number;
  }>;
}

export async function upsertPageLayoutServer(input: {
  envelope_id: string;
  document_id: string;
  page_index: number;
  recipient_id: string;
  mode: "manual" | "auto";
  orientation: "horizontal" | "vertical" | null;
  sequence: string[];
  origin_x_pt: number | null;
  origin_y_pt: number | null;
  spacing_pt: number;
}) {
  const row = {
    envelope_id: input.envelope_id,
    document_id: input.document_id,
    page_index: input.page_index,
    recipient_id: input.recipient_id,
    mode: input.mode,
    orientation: input.orientation,
    sequence_json: input.sequence,
    origin_x_pt: input.origin_x_pt,
    origin_y_pt: input.origin_y_pt,
    spacing_pt: input.spacing_pt,
    updated_at: new Date().toISOString(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (supabaseAdmin as any).from("esign_page_layouts");
  const { error } = await tbl.upsert(row, {
    onConflict: "envelope_id,document_id,page_index,recipient_id",
  });
  if (error) throw new Error(error.message);
}

export async function addDocumentServer(input: {
  envelope_id: string;
  name: string;
  source_mime: string;
  source_path: string;
  order_index: number;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("esign_documents")
    .insert(input)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function getEnvelopeOverviewServer(envelopeId: string) {
  const [envRes, docsRes, recipientsRes] = await Promise.all([
    supabaseAdmin.from("esign_envelopes").select("*").eq("id", envelopeId).maybeSingle(),
    supabaseAdmin
      .from("esign_documents")
      .select("*")
      .eq("envelope_id", envelopeId)
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("esign_recipients")
      .select("*")
      .eq("envelope_id", envelopeId)
      .order("routing_order", { ascending: true }),
  ]);
  if (envRes.error) throw new Error(envRes.error.message);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (recipientsRes.error) throw new Error(recipientsRes.error.message);
  return {
    envelope: envRes.data,
    documents: docsRes.data ?? [],
    recipients: recipientsRes.data ?? [],
  };
}

export async function deleteDocumentServer(documentId: string) {
  // Caller has already validated envelope ownership via the upstream serverFn.
  const { data: doc, error: fetchErr } = await supabaseAdmin
    .from("esign_documents")
    .select("source_path")
    .eq("id", documentId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (doc?.source_path) {
    await supabaseAdmin.storage.from("esign-source").remove([doc.source_path]);
  }
  const { error } = await supabaseAdmin.from("esign_documents").delete().eq("id", documentId);
  if (error) throw new Error(error.message);
}

export type EnvelopeIdDocument = {
  field_id: string;
  recipient_id: string;
  recipient_name: string;
  recipient_email: string;
  filename: string;
  mime: string;
  size_bytes: number | null;
  signed_url: string;
  submitted_at: string | null;
};

export async function listEnvelopeIdDocumentsServer(
  envelopeId: string,
): Promise<EnvelopeIdDocument[]> {
  // Fetch all signer_id_document fields for this envelope
  const { data: fields, error: fErr } = await supabaseAdmin
    .from("esign_fields")
    .select("id, recipient_id, document_id")
    .eq("field_type", "signer_id_document");
  if (fErr) throw new Error(fErr.message);

  // Filter by envelope via documents lookup
  const { data: docs } = await supabaseAdmin
    .from("esign_documents")
    .select("id")
    .eq("envelope_id", envelopeId);
  const docIds = new Set((docs ?? []).map((d) => d.id));
  const envFields = (fields ?? []).filter((f) => docIds.has(f.document_id));
  if (envFields.length === 0) return [];

  const fieldIds = envFields.map((f) => f.id);
  const recipientIds = Array.from(new Set(envFields.map((f) => f.recipient_id)));

  const [{ data: values, error: vErr }, { data: recipients, error: rErr }] = await Promise.all([
    supabaseAdmin
      .from("esign_field_values")
      .select("field_id, value_image_path, signed_at")
      .in("field_id", fieldIds),
    supabaseAdmin.from("esign_recipients").select("id, full_name, email").in("id", recipientIds),
  ]);
  if (vErr) throw new Error(vErr.message);
  if (rErr) throw new Error(rErr.message);

  const recipientById = new Map((recipients ?? []).map((r) => [r.id, r] as const));
  const fieldById = new Map(envFields.map((f) => [f.id, f] as const));

  const out: EnvelopeIdDocument[] = [];
  for (const v of values ?? []) {
    if (!v.value_image_path) continue;
    const f = fieldById.get(v.field_id);
    if (!f) continue;
    const r = recipientById.get(f.recipient_id);
    if (!r) continue;
    const { data: signed } = await supabaseAdmin.storage
      .from("esign-id-docs")
      .createSignedUrl(v.value_image_path, 60 * 10);
    if (!signed?.signedUrl) continue;
    const filename = v.value_image_path.split("/").pop() ?? "id-document";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mime = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
    out.push({
      field_id: v.field_id,
      recipient_id: f.recipient_id,
      recipient_name: r.full_name,
      recipient_email: r.email,
      filename,
      mime,
      size_bytes: null,
      signed_url: signed.signedUrl,
      submitted_at: (v as { signed_at?: string | null }).signed_at ?? null,
    });
  }
  return out;
}
