/**
 * Server-only helpers for the Organizer Hub.
 * Imported only by *.functions.ts modules.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { OrganizerBlock, OrganizerTemplate, TemplateStatus } from "./schemas";

type AnyJson = Record<string, unknown> | null;

function asTemplate(row: Record<string, unknown>): OrganizerTemplate {
  return row as unknown as OrganizerTemplate;
}
function asBlock(row: Record<string, unknown>): OrganizerBlock {
  return row as unknown as OrganizerBlock;
}

export async function listTemplatesServer(): Promise<OrganizerTemplate[]> {
  const { data, error } = await supabaseAdmin
    .from("organizer_templates")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(asTemplate);
}

export async function getTemplateWithBlocksServer(templateId: string): Promise<{
  template: OrganizerTemplate | null;
  blocks: OrganizerBlock[];
}> {
  const [tplRes, blocksRes] = await Promise.all([
    supabaseAdmin.from("organizer_templates").select("*").eq("id", templateId).maybeSingle(),
    supabaseAdmin
      .from("organizer_blocks")
      .select("*")
      .eq("template_id", templateId)
      .order("order_index", { ascending: true }),
  ]);
  if (tplRes.error) throw new Error(tplRes.error.message);
  if (blocksRes.error) throw new Error(blocksRes.error.message);
  return {
    template: tplRes.data ? asTemplate(tplRes.data) : null,
    blocks: (blocksRes.data ?? []).map(asBlock),
  };
}

export async function createTemplateServer(args: {
  name: string;
  description?: string | null;
  purpose: OrganizerTemplate["purpose"];
  is_exam: boolean;
  createdBy: string;
}): Promise<OrganizerTemplate> {
  const { data, error } = await supabaseAdmin
    .from("organizer_templates")
    .insert({
      name: args.name,
      description: args.description ?? null,
      purpose: args.purpose,
      is_exam: args.is_exam,
      created_by: args.createdBy,
      status: "draft" satisfies TemplateStatus,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asTemplate(data);
}

export async function updateTemplateServer(args: {
  id: string;
  patch: Partial<
    Pick<
      OrganizerTemplate,
      "name" | "description" | "purpose" | "is_exam" | "passing_score" | "status" | "display_mode"
    >
  >;
}): Promise<OrganizerTemplate> {
  const { data, error } = await supabaseAdmin
    .from("organizer_templates")
    .update(args.patch)
    .eq("id", args.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asTemplate(data);
}

export async function deleteTemplateServer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("organizer_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function upsertBlockServer(args: {
  id?: string;
  template_id: string;
  parent_id?: string | null;
  order_index?: number;
  block_type: OrganizerBlock["block_type"];
  question_text?: string | null;
  help_text?: string | null;
  is_required?: boolean;
  config_json?: Record<string, unknown>;
  conditional_rules_json?: AnyJson;
  scoring_json?: AnyJson;
}): Promise<OrganizerBlock> {
  if (args.id) {
    const patch: Record<string, unknown> = {};
    if (args.parent_id !== undefined) patch.parent_id = args.parent_id;
    if (args.order_index !== undefined) patch.order_index = args.order_index;
    if (args.block_type !== undefined) patch.block_type = args.block_type;
    if (args.question_text !== undefined) patch.question_text = args.question_text;
    if (args.help_text !== undefined) patch.help_text = args.help_text;
    if (args.is_required !== undefined) patch.is_required = args.is_required;
    if (args.config_json !== undefined) patch.config_json = args.config_json;
    if (args.conditional_rules_json !== undefined)
      patch.conditional_rules_json = args.conditional_rules_json;
    if (args.scoring_json !== undefined) patch.scoring_json = args.scoring_json;
    const { data, error } = await supabaseAdmin
      .from("organizer_blocks")
      .update(patch as never)
      .eq("id", args.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return asBlock(data);
  }

  // Insert — derive order_index if not provided.
  let orderIndex = args.order_index;
  if (orderIndex === undefined) {
    const baseQ = supabaseAdmin
      .from("organizer_blocks")
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
    .from("organizer_blocks")
    .insert({
      template_id: args.template_id,
      parent_id: args.parent_id ?? null,
      order_index: orderIndex,
      // Schema allows more block kinds than the DB enum currently lists; cast past it.
      block_type: args.block_type as never,
      question_text: args.question_text ?? null,
      help_text: args.help_text ?? null,
      is_required: args.is_required ?? false,
      config_json: (args.config_json ?? {}) as never,
      conditional_rules_json: (args.conditional_rules_json ?? null) as never,
      scoring_json: (args.scoring_json ?? null) as never,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asBlock(data);
}

export async function deleteBlockServer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("organizer_blocks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderBlocksServer(args: {
  template_id: string;
  moves: Array<{ id: string; parent_id: string | null; order_index: number }>;
}): Promise<void> {
  // Naive sequential update — fine for now; batch with rpc later if needed.
  for (const m of args.moves) {
    const { error } = await supabaseAdmin
      .from("organizer_blocks")
      .update({ parent_id: m.parent_id, order_index: m.order_index })
      .eq("id", m.id)
      .eq("template_id", args.template_id);
    if (error) throw new Error(error.message);
  }
}

/**
 * Publish current draft. If the template is already published, fork v+1 as
 * a new draft so in-flight deployments stay pinned to the existing version.
 */
export async function publishTemplateServer(args: {
  id: string;
  actorId: string;
}): Promise<OrganizerTemplate> {
  const { data: current, error } = await supabaseAdmin
    .from("organizer_templates")
    .select("*")
    .eq("id", args.id)
    .single();
  if (error) throw new Error(error.message);
  const tpl = asTemplate(current);

  if (tpl.status === "draft") {
    const { data, error: upErr } = await supabaseAdmin
      .from("organizer_templates")
      .update({ status: "published" })
      .eq("id", tpl.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);
    const published = asTemplate(data);
    // Capture an immutable version snapshot for history/rollback.
    try {
      const { captureTemplateSnapshotServer } = await import("./versions.server");
      await captureTemplateSnapshotServer({
        template_id: published.id,
        actor_id: args.actorId,
        note: `Published v${published.version}`,
      });
    } catch {
      // Non-fatal: publishing must succeed even if snapshot write fails.
    }
    return published;
  }

  // already published or archived → fork next draft version
  const { data: forked, error: forkErr } = await supabaseAdmin
    .from("organizer_templates")
    .insert({
      name: tpl.name,
      description: tpl.description,
      purpose: tpl.purpose,
      is_exam: tpl.is_exam,
      passing_score: tpl.passing_score,
      status: "draft",
      version: tpl.version + 1,
      parent_template_id: tpl.id,
      firm_id: tpl.firm_id,
      created_by: args.actorId,
    })
    .select("*")
    .single();
  if (forkErr) throw new Error(forkErr.message);

  const newTpl = asTemplate(forked);

  // Copy blocks
  const { data: srcBlocks, error: blocksErr } = await supabaseAdmin
    .from("organizer_blocks")
    .select("*")
    .eq("template_id", tpl.id);
  if (blocksErr) throw new Error(blocksErr.message);

  if (srcBlocks && srcBlocks.length > 0) {
    // Map old → new ids for parent re-linking
    const idMap = new Map<string, string>();
    // First pass: create rows without parent_id, capture mapping.
    const inserts = srcBlocks.map((b) => {
      const newId = crypto.randomUUID();
      idMap.set(b.id as string, newId);
      return {
        id: newId,
        template_id: newTpl.id,
        parent_id: null as string | null,
        order_index: b.order_index,
        block_type: b.block_type,
        question_text: b.question_text,
        help_text: b.help_text,
        is_required: b.is_required,
        config_json: b.config_json,
        conditional_rules_json: b.conditional_rules_json,
        scoring_json: b.scoring_json,
      };
    });
    const { error: insErr } = await supabaseAdmin.from("organizer_blocks").insert(inserts as never);
    if (insErr) throw new Error(insErr.message);
    // Second pass: set parent_id using map.
    for (const b of srcBlocks) {
      if (!b.parent_id) continue;
      const newParent = idMap.get(b.parent_id as string);
      const newSelf = idMap.get(b.id as string);
      if (!newParent || !newSelf) continue;
      await supabaseAdmin
        .from("organizer_blocks")
        .update({ parent_id: newParent })
        .eq("id", newSelf);
    }
  }

  return newTpl;
}
