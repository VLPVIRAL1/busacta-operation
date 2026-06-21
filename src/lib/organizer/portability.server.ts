/**
 * Server-only helpers for exporting / importing organizer templates as JSON.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { OrganizerBlock, OrganizerTemplate } from "./schemas";

export const ORGANIZER_EXPORT_FORMAT = "busacta.organizer.template.v1" as const;

export type OrganizerExportPayload = {
  format: typeof ORGANIZER_EXPORT_FORMAT;
  exported_at: string;
  template: {
    name: string;
    description: string | null;
    purpose: OrganizerTemplate["purpose"];
    is_exam: boolean;
    passing_score: number | null;
  };
  blocks: Array<{
    id: string;
    parent_id: string | null;
    order_index: number;
    block_type: OrganizerBlock["block_type"];
    question_text: string | null;
    help_text: string | null;
    is_required: boolean;
    config_json: Record<string, unknown> | null;
    conditional_rules_json: Record<string, unknown> | null;
    scoring_json: Record<string, unknown> | null;
  }>;
};

export async function exportTemplateServer(templateId: string): Promise<OrganizerExportPayload> {
  const [tplRes, blocksRes] = await Promise.all([
    supabaseAdmin.from("organizer_templates").select("*").eq("id", templateId).maybeSingle(),
    supabaseAdmin
      .from("organizer_blocks")
      .select("*")
      .eq("template_id", templateId)
      .order("order_index", { ascending: true }),
  ]);
  if (tplRes.error) throw new Error(tplRes.error.message);
  if (!tplRes.data) throw new Error("Template not found");
  if (blocksRes.error) throw new Error(blocksRes.error.message);

  const tpl = tplRes.data as unknown as OrganizerTemplate;
  const blocks = (blocksRes.data ?? []) as unknown as OrganizerBlock[];

  return {
    format: ORGANIZER_EXPORT_FORMAT,
    exported_at: new Date().toISOString(),
    template: {
      name: tpl.name,
      description: tpl.description ?? null,
      purpose: tpl.purpose,
      is_exam: tpl.is_exam,
      passing_score: tpl.passing_score ?? null,
    },
    blocks: blocks.map((b) => ({
      id: b.id,
      parent_id: b.parent_id ?? null,
      order_index: b.order_index,
      block_type: b.block_type,
      question_text: b.question_text ?? null,
      help_text: b.help_text ?? null,
      is_required: b.is_required,
      config_json: (b.config_json ?? null) as Record<string, unknown> | null,
      conditional_rules_json: (b.conditional_rules_json ?? null) as Record<string, unknown> | null,
      scoring_json: (b.scoring_json ?? null) as Record<string, unknown> | null,
    })),
  };
}

/** Recursively remap blockId references inside a conditional-rules JSON tree. */
function remapRules(node: unknown, idMap: Map<string, string>): unknown {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((n) => remapRules(n, idMap));
  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "blockId" && typeof v === "string") {
      out[k] = idMap.get(v) ?? v;
    } else {
      out[k] = remapRules(v, idMap);
    }
  }
  return out;
}

export async function importTemplateServer(args: {
  payload: OrganizerExportPayload;
  createdBy: string;
  nameOverride?: string | null;
}): Promise<OrganizerTemplate> {
  const { payload } = args;
  if (payload.format !== ORGANIZER_EXPORT_FORMAT) {
    throw new Error("Unsupported file format");
  }

  const { data: newTplRow, error: tplErr } = await supabaseAdmin
    .from("organizer_templates")
    .insert({
      name: (args.nameOverride?.trim() || payload.template.name).slice(0, 200),
      description: payload.template.description,
      purpose: payload.template.purpose,
      is_exam: payload.template.is_exam,
      passing_score: payload.template.passing_score,
      status: "draft",
      created_by: args.createdBy,
    })
    .select("*")
    .single();
  if (tplErr) throw new Error(tplErr.message);
  const newTpl = newTplRow as unknown as OrganizerTemplate;

  if (payload.blocks.length === 0) return newTpl;

  // Allocate new ids and build remap.
  const idMap = new Map<string, string>();
  for (const b of payload.blocks) idMap.set(b.id, crypto.randomUUID());

  // First pass: insert with parent_id = null (preserve order_index).
  const inserts = payload.blocks.map((b) => ({
    id: idMap.get(b.id)!,
    template_id: newTpl.id,
    parent_id: null as string | null,
    order_index: b.order_index,
    block_type: b.block_type,
    question_text: b.question_text,
    help_text: b.help_text,
    is_required: b.is_required,
    config_json: (b.config_json ?? {}) as never,
    conditional_rules_json: (b.conditional_rules_json
      ? remapRules(b.conditional_rules_json, idMap)
      : null) as never,
    scoring_json: (b.scoring_json ?? null) as never,
  }));
  const { error: insErr } = await supabaseAdmin.from("organizer_blocks").insert(inserts as never);
  if (insErr) throw new Error(insErr.message);

  // Second pass: set parent_id using map.
  for (const b of payload.blocks) {
    if (!b.parent_id) continue;
    const newParent = idMap.get(b.parent_id);
    const newSelf = idMap.get(b.id);
    if (!newParent || !newSelf) continue;
    const { error } = await supabaseAdmin
      .from("organizer_blocks")
      .update({ parent_id: newParent })
      .eq("id", newSelf);
    if (error) throw new Error(error.message);
  }

  return newTpl;
}
