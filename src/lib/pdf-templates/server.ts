/**
 * Server-only helpers for the PDF Template engine.
 * Imported only by functions.ts and the export API route.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  PdfTemplate,
  PdfTemplateField,
  PdfTemplateStatus,
  UpsertFieldInput,
  ReorderFieldsInput,
} from "./schemas";

function asTpl(row: Record<string, unknown>): PdfTemplate {
  return row as unknown as PdfTemplate;
}
function asField(row: Record<string, unknown>): PdfTemplateField {
  return row as unknown as PdfTemplateField;
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listTemplatesServer(args?: {
  docType?: string;
  firmId?: string;
}): Promise<PdfTemplate[]> {
  let q = supabaseAdmin.from("pdf_templates").select("*").order("updated_at", { ascending: false });
  if (args?.docType) q = q.eq("doc_type", args.docType as never);
  if (args?.firmId) q = q.eq("firm_id", args.firmId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(asTpl);
}

// ─── Get with fields ─────────────────────────────────────────────────────────

export async function getTemplateWithFieldsServer(templateId: string): Promise<{
  template: PdfTemplate | null;
  fields: PdfTemplateField[];
}> {
  const [tplRes, fieldsRes] = await Promise.all([
    supabaseAdmin.from("pdf_templates").select("*").eq("id", templateId).maybeSingle(),
    supabaseAdmin
      .from("pdf_template_fields")
      .select("*")
      .eq("template_id", templateId)
      .order("order_index", { ascending: true }),
  ]);
  if (tplRes.error) throw new Error(tplRes.error.message);
  if (fieldsRes.error) throw new Error(fieldsRes.error.message);
  return {
    template: tplRes.data ? asTpl(tplRes.data) : null,
    fields: (fieldsRes.data ?? []).map(asField),
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createTemplateServer(args: {
  name: string;
  doc_type: string;
  description?: string | null;
  firm_id?: string | null;
  is_global?: boolean;
  createdBy: string;
}): Promise<PdfTemplate> {
  const { data, error } = await supabaseAdmin
    .from("pdf_templates")
    .insert({
      name: args.name,
      doc_type: args.doc_type as never,
      description: args.description ?? null,
      firm_id: args.firm_id ?? null,
      is_global: args.is_global ?? false,
      created_by: args.createdBy,
      status: "draft" satisfies PdfTemplateStatus,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asTpl(data);
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateTemplateServer(args: {
  id: string;
  patch: Record<string, unknown>;
}): Promise<PdfTemplate> {
  const { data, error } = await supabaseAdmin
    .from("pdf_templates")
    .update(args.patch as never)
    .eq("id", args.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asTpl(data);
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteTemplateServer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("pdf_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Upsert field ────────────────────────────────────────────────────────────

export async function upsertFieldServer(args: UpsertFieldInput): Promise<PdfTemplateField> {
  if (args.id) {
    const patch: Record<string, unknown> = {};
    if (args.parent_id !== undefined) patch.parent_id = args.parent_id;
    if (args.order_index !== undefined) patch.order_index = args.order_index;
    if (args.field_type !== undefined) patch.field_type = args.field_type;
    if (args.label !== undefined) patch.label = args.label;
    if (args.config_json !== undefined) patch.config_json = args.config_json;
    if (args.is_visible !== undefined) patch.is_visible = args.is_visible;
    const { data, error } = await supabaseAdmin
      .from("pdf_template_fields")
      .update(patch as never)
      .eq("id", args.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return asField(data);
  }

  // Insert — derive order_index if not provided
  let orderIndex = args.order_index;
  if (orderIndex === undefined) {
    const baseQ = supabaseAdmin
      .from("pdf_template_fields")
      .select("order_index")
      .eq("template_id", args.template_id);
    const parent = args.parent_id ?? null;
    const scopedQ = parent === null ? baseQ.is("parent_id", null) : baseQ.eq("parent_id", parent);
    const { data: maxRow } = await scopedQ
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    orderIndex = maxRow && typeof maxRow.order_index === "number" ? maxRow.order_index + 1 : 0;
  }

  const { data, error } = await supabaseAdmin
    .from("pdf_template_fields")
    .insert({
      template_id: args.template_id,
      parent_id: args.parent_id ?? null,
      order_index: orderIndex,
      field_type: args.field_type as never,
      label: args.label ?? null,
      config_json: (args.config_json ?? {}) as never,
      is_visible: args.is_visible ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asField(data);
}

// ─── Delete field ────────────────────────────────────────────────────────────

export async function deleteFieldServer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("pdf_template_fields").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Reorder fields ──────────────────────────────────────────────────────────

export async function reorderFieldsServer(args: ReorderFieldsInput): Promise<void> {
  for (const m of args.moves) {
    const { error } = await supabaseAdmin
      .from("pdf_template_fields")
      .update({ parent_id: m.parent_id, order_index: m.order_index })
      .eq("id", m.id)
      .eq("template_id", args.template_id);
    if (error) throw new Error(error.message);
  }
}

// ─── Publish / fork ──────────────────────────────────────────────────────────

export async function publishTemplateServer(args: {
  id: string;
  actorId: string;
}): Promise<PdfTemplate> {
  const { data: current, error } = await supabaseAdmin
    .from("pdf_templates")
    .select("*")
    .eq("id", args.id)
    .single();
  if (error) throw new Error(error.message);
  const tpl = asTpl(current);

  if (tpl.status === "draft") {
    const { data, error: upErr } = await supabaseAdmin
      .from("pdf_templates")
      .update({ status: "published" as never })
      .eq("id", tpl.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);
    return asTpl(data);
  }

  // Already published/archived → fork a new draft with version+1
  const { data: forked, error: forkErr } = await supabaseAdmin
    .from("pdf_templates")
    .insert({
      name: tpl.name,
      description: tpl.description,
      doc_type: tpl.doc_type as never,
      status: "draft" as never,
      version: tpl.version + 1,
      parent_template_id: tpl.id,
      firm_id: tpl.firm_id,
      is_global: tpl.is_global,
      primary_color: tpl.primary_color,
      secondary_color: tpl.secondary_color,
      font_family: tpl.font_family,
      logo_storage_path: tpl.logo_storage_path,
      page_size: tpl.page_size,
      orientation: tpl.orientation as never,
      margin_top: tpl.margin_top,
      margin_right: tpl.margin_right,
      margin_bottom: tpl.margin_bottom,
      margin_left: tpl.margin_left,
      created_by: args.actorId,
    })
    .select("*")
    .single();
  if (forkErr) throw new Error(forkErr.message);
  const newTpl = asTpl(forked);

  // Copy fields with id remapping for parent_id references
  const { data: srcFields, error: fieldsErr } = await supabaseAdmin
    .from("pdf_template_fields")
    .select("*")
    .eq("template_id", tpl.id);
  if (fieldsErr) throw new Error(fieldsErr.message);

  if (srcFields && srcFields.length > 0) {
    const idMap = new Map<string, string>();
    const inserts = srcFields.map((f) => {
      const newId = crypto.randomUUID();
      idMap.set(f.id as string, newId);
      return {
        id: newId,
        template_id: newTpl.id,
        parent_id: null as string | null,
        order_index: f.order_index,
        field_type: f.field_type,
        label: f.label,
        config_json: f.config_json,
        is_visible: f.is_visible,
      };
    });
    const { error: insErr } = await supabaseAdmin
      .from("pdf_template_fields")
      .insert(inserts as never);
    if (insErr) throw new Error(insErr.message);

    for (const f of srcFields) {
      if (!f.parent_id) continue;
      const newParent = idMap.get(f.parent_id as string);
      const newSelf = idMap.get(f.id as string);
      if (!newParent || !newSelf) continue;
      await supabaseAdmin
        .from("pdf_template_fields")
        .update({ parent_id: newParent })
        .eq("id", newSelf);
    }
  }

  return newTpl;
}

// ─── Duplicate ───────────────────────────────────────────────────────────────

export async function duplicateTemplateServer(args: {
  id: string;
  actorId: string;
}): Promise<PdfTemplate> {
  const { template: src, fields } = await getTemplateWithFieldsServer(args.id);
  if (!src) throw new Error("Template not found");

  const { data: copy, error } = await supabaseAdmin
    .from("pdf_templates")
    .insert({
      name: `${src.name} (Copy)`,
      description: src.description,
      doc_type: src.doc_type as never,
      status: "draft" as never,
      version: 1,
      firm_id: src.firm_id,
      is_global: src.is_global,
      primary_color: src.primary_color,
      secondary_color: src.secondary_color,
      font_family: src.font_family,
      page_size: src.page_size,
      orientation: src.orientation as never,
      margin_top: src.margin_top,
      margin_right: src.margin_right,
      margin_bottom: src.margin_bottom,
      margin_left: src.margin_left,
      created_by: args.actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const newTpl = asTpl(copy);

  if (fields.length > 0) {
    const idMap = new Map<string, string>();
    const inserts = fields.map((f) => {
      const newId = crypto.randomUUID();
      idMap.set(f.id, newId);
      return {
        id: newId,
        template_id: newTpl.id,
        parent_id: null as string | null,
        order_index: f.order_index,
        field_type: f.field_type,
        label: f.label,
        config_json: f.config_json,
        is_visible: f.is_visible,
      };
    });
    const { error: insErr } = await supabaseAdmin
      .from("pdf_template_fields")
      .insert(inserts as never);
    if (insErr) throw new Error(insErr.message);

    for (const f of fields) {
      if (!f.parent_id) continue;
      const newParent = idMap.get(f.parent_id);
      const newSelf = idMap.get(f.id);
      if (!newParent || !newSelf) continue;
      await supabaseAdmin
        .from("pdf_template_fields")
        .update({ parent_id: newParent })
        .eq("id", newSelf);
    }
  }

  return newTpl;
}

// ─── Version history ─────────────────────────────────────────────────────────

export async function getVersionHistoryServer(templateId: string): Promise<PdfTemplate[]> {
  // Walk up to find root, then fetch all versions in lineage
  const { data: root } = await supabaseAdmin
    .from("pdf_templates")
    .select("id, parent_template_id, version")
    .eq("id", templateId)
    .maybeSingle();

  const rootId = root?.parent_template_id ?? root?.id ?? templateId;

  const { data, error } = await supabaseAdmin
    .from("pdf_templates")
    .select("*")
    .or(`id.eq.${rootId},parent_template_id.eq.${rootId}`)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(asTpl);
}
