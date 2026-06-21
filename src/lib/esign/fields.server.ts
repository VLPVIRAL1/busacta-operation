import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FieldInput } from "./schemas";

async function assertDraft(envelopeId: string) {
  const { data, error } = await supabaseAdmin
    .from("esign_envelopes")
    .select("status")
    .eq("id", envelopeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Envelope not found");
  if (data.status !== "draft") {
    throw new Error("Fields can only be edited while envelope is a draft");
  }
}

export async function listFieldsServer(envelopeId: string) {
  const { data, error } = await supabaseAdmin
    .from("esign_fields")
    .select("*")
    .eq("envelope_id", envelopeId)
    .order("page_index", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertFieldServer(field: FieldInput) {
  await assertDraft(field.envelope_id);
  const row = {
    envelope_id: field.envelope_id,
    document_id: field.document_id,
    recipient_id: field.recipient_id,
    field_type: field.field_type,
    page_index: field.page_index,
    x_pt: field.x_pt,
    y_pt: field.y_pt,
    width_pt: field.width_pt,
    height_pt: field.height_pt,
    is_required: field.is_required,
    default_value: field.default_value ?? null,
    options_json: (field.options_json ?? null) as never,
    conditional_json: (field.conditional_json ?? null) as never,
    tab_order: field.tab_order ?? null,
  };
  if (field.id) {
    const { data, error } = await supabaseAdmin
      .from("esign_fields")
      .update(row)
      .eq("id", field.id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }
  const { data, error } = await supabaseAdmin
    .from("esign_fields")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function deleteFieldServer(fieldId: string) {
  const { data: f, error: fErr } = await supabaseAdmin
    .from("esign_fields")
    .select("envelope_id")
    .eq("id", fieldId)
    .maybeSingle();
  if (fErr) throw new Error(fErr.message);
  if (!f) return;
  await assertDraft(f.envelope_id);
  const { error } = await supabaseAdmin.from("esign_fields").delete().eq("id", fieldId);
  if (error) throw new Error(error.message);
}
