/**
 * E-Signature templates. A template is a snapshot of recipient roles + field
 * layout extracted from a draft envelope, persisted as `field_layout_json` on
 * `esign_templates`. Documents are NOT stored — each envelope keeps its own.
 *
 * Layout shape (v1):
 * {
 *   version: 1,
 *   roles: [{ key, label, role, auth_method, routing_order, color_hex }],
 *   fields: [{ role_key, document_index, field_type, page_index,
 *              x_pt, y_pt, width_pt, height_pt, is_required,
 *              default_value, options_json, tab_order }]
 * }
 *
 * Conditional logic is NOT preserved across templates because the source
 * field IDs change on every apply. Strip on save, re-author after apply.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FieldOptions, RecipientRole, AuthMethod, FieldType } from "./schemas";

export type TemplateRole = {
  key: string;
  label: string;
  role: RecipientRole;
  auth_method: AuthMethod;
  routing_order: number;
  color_hex: string;
};

export type TemplateField = {
  role_key: string;
  document_index: number;
  field_type: FieldType;
  page_index: number;
  x_pt: number;
  y_pt: number;
  width_pt: number;
  height_pt: number;
  is_required: boolean;
  default_value: string | null;
  options_json: FieldOptions | null;
  tab_order: number | null;
};

export type TemplateLayout = {
  version: 1;
  roles: TemplateRole[];
  fields: TemplateField[];
};

export async function listTemplatesServer(firmId?: string) {
  let q = supabaseAdmin
    .from("esign_templates")
    .select("id, firm_id, name, doc_kind, created_at, field_layout_json")
    .order("created_at", { ascending: false })
    .limit(500);
  if (firmId) q = q.eq("firm_id", firmId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const layout = (row.field_layout_json ?? {}) as Partial<TemplateLayout>;
    return {
      id: row.id,
      firm_id: row.firm_id,
      name: row.name,
      doc_kind: row.doc_kind,
      created_at: row.created_at,
      role_count: layout.roles?.length ?? 0,
      field_count: layout.fields?.length ?? 0,
    };
  });
}

export async function getTemplateServer(templateId: string) {
  const { data, error } = await supabaseAdmin
    .from("esign_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Template not found");
  return {
    id: data.id,
    firm_id: data.firm_id,
    name: data.name,
    doc_kind: data.doc_kind,
    created_at: data.created_at,
    layout: (data.field_layout_json ?? { version: 1, roles: [], fields: [] }) as TemplateLayout,
  };
}

export async function saveTemplateFromEnvelopeServer(input: {
  envelope_id: string;
  name: string;
  doc_kind: string | null;
  created_by: string;
}): Promise<string> {
  const { envelope_id, name, doc_kind, created_by } = input;

  const [envRes, docsRes, rcptRes, fieldRes] = await Promise.all([
    supabaseAdmin.from("esign_envelopes").select("firm_id").eq("id", envelope_id).maybeSingle(),
    supabaseAdmin
      .from("esign_documents")
      .select("id, order_index")
      .eq("envelope_id", envelope_id)
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("esign_recipients")
      .select("id, full_name, role, auth_method, routing_order, color_hex")
      .eq("envelope_id", envelope_id)
      .order("routing_order", { ascending: true }),
    supabaseAdmin
      .from("esign_fields")
      .select(
        "document_id, recipient_id, field_type, page_index, x_pt, y_pt, width_pt, height_pt, is_required, default_value, options_json, tab_order",
      )
      .eq("envelope_id", envelope_id),
  ]);
  if (envRes.error) throw new Error(envRes.error.message);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (rcptRes.error) throw new Error(rcptRes.error.message);
  if (fieldRes.error) throw new Error(fieldRes.error.message);
  if (!envRes.data) throw new Error("Envelope not found");

  const docIndexById = new Map<string, number>();
  (docsRes.data ?? []).forEach((d, i) => docIndexById.set(d.id, i));

  const roleKeyByRecipientId = new Map<string, string>();
  const roles: TemplateRole[] = (rcptRes.data ?? []).map((r, i) => {
    const key = `role_${i}`;
    roleKeyByRecipientId.set(r.id, key);
    return {
      key,
      label: r.full_name || `Recipient ${i + 1}`,
      role: r.role as RecipientRole,
      auth_method: r.auth_method as AuthMethod,
      routing_order: r.routing_order ?? i + 1,
      color_hex: r.color_hex ?? "#4f46e5",
    };
  });

  const fields: TemplateField[] = [];
  for (const f of fieldRes.data ?? []) {
    const roleKey = roleKeyByRecipientId.get(f.recipient_id);
    const docIndex = docIndexById.get(f.document_id);
    if (!roleKey || docIndex === undefined) continue;
    fields.push({
      role_key: roleKey,
      document_index: docIndex,
      field_type: f.field_type as FieldType,
      page_index: f.page_index,
      x_pt: Number(f.x_pt),
      y_pt: Number(f.y_pt),
      width_pt: Number(f.width_pt),
      height_pt: Number(f.height_pt),
      is_required: !!f.is_required,
      default_value: f.default_value ?? null,
      options_json: (f.options_json ?? null) as FieldOptions | null,
      tab_order: f.tab_order ?? null,
    });
  }

  const layout: TemplateLayout = { version: 1, roles, fields };

  const { data, error } = await supabaseAdmin
    .from("esign_templates")
    .insert({
      firm_id: envRes.data.firm_id,
      name,
      doc_kind: doc_kind ?? null,
      field_layout_json: layout as never,
      created_by,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function deleteTemplateServer(templateId: string) {
  const { error } = await supabaseAdmin.from("esign_templates").delete().eq("id", templateId);
  if (error) throw new Error(error.message);
}

/**
 * Apply a template's field layout to a draft envelope. Matches roles to
 * recipients by routing_order index, and templated documents to envelope
 * documents by order_index. Both lists must be at least as long as the
 * template requires.
 *
 * Replaces any existing fields in the target envelope.
 */
export async function applyTemplateToEnvelopeServer(input: {
  envelope_id: string;
  template_id: string;
}): Promise<{ inserted: number }> {
  const { envelope_id, template_id } = input;

  const envRes = await supabaseAdmin
    .from("esign_envelopes")
    .select("status, firm_id")
    .eq("id", envelope_id)
    .maybeSingle();
  if (envRes.error) throw new Error(envRes.error.message);
  if (!envRes.data) throw new Error("Envelope not found");
  if (envRes.data.status !== "draft") {
    throw new Error("Template can only be applied to a draft envelope");
  }

  const tpl = await getTemplateServer(template_id);
  if (tpl.firm_id !== envRes.data.firm_id) {
    throw new Error("Template belongs to a different firm");
  }

  const [docsRes, rcptRes] = await Promise.all([
    supabaseAdmin
      .from("esign_documents")
      .select("id, order_index")
      .eq("envelope_id", envelope_id)
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("esign_recipients")
      .select("id, routing_order")
      .eq("envelope_id", envelope_id)
      .order("routing_order", { ascending: true }),
  ]);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (rcptRes.error) throw new Error(rcptRes.error.message);

  const docs = docsRes.data ?? [];
  const rcpts = rcptRes.data ?? [];

  const neededDocs = tpl.layout.fields.reduce((m, f) => Math.max(m, f.document_index + 1), 0);
  if (docs.length < neededDocs) {
    throw new Error(`Template needs ${neededDocs} document(s); envelope has ${docs.length}`);
  }
  if (rcpts.length < tpl.layout.roles.length) {
    throw new Error(
      `Template needs ${tpl.layout.roles.length} recipient(s); envelope has ${rcpts.length}`,
    );
  }

  const roleKeyToRecipientId = new Map<string, string>();
  tpl.layout.roles.forEach((r, i) => {
    const target = rcpts[i];
    if (target) roleKeyToRecipientId.set(r.key, target.id);
  });

  // Replace existing fields on this envelope.
  const { error: delErr } = await supabaseAdmin
    .from("esign_fields")
    .delete()
    .eq("envelope_id", envelope_id);
  if (delErr) throw new Error(delErr.message);

  if (tpl.layout.fields.length === 0) return { inserted: 0 };

  const rows = tpl.layout.fields
    .map((f) => {
      const recipientId = roleKeyToRecipientId.get(f.role_key);
      const doc = docs[f.document_index];
      if (!recipientId || !doc) return null;
      return {
        envelope_id,
        document_id: doc.id,
        recipient_id: recipientId,
        field_type: f.field_type,
        page_index: f.page_index,
        x_pt: f.x_pt,
        y_pt: f.y_pt,
        width_pt: f.width_pt,
        height_pt: f.height_pt,
        is_required: f.is_required,
        default_value: f.default_value,
        options_json: (f.options_json ?? null) as never,
        conditional_json: null as never,
        tab_order: f.tab_order,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return { inserted: 0 };
  const { error } = await supabaseAdmin.from("esign_fields").insert(rows);
  if (error) throw new Error(error.message);
  return { inserted: rows.length };
}
