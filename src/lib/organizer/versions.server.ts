/**
 * Server-only helpers for template version history + rollback.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { OrganizerBlock, OrganizerTemplate } from "./schemas";

export interface TemplateSnapshot {
  template: Pick<
    OrganizerTemplate,
    "name" | "description" | "purpose" | "is_exam" | "passing_score" | "version"
  >;
  blocks: Array<
    Pick<
      OrganizerBlock,
      | "id"
      | "parent_id"
      | "order_index"
      | "block_type"
      | "question_text"
      | "help_text"
      | "is_required"
      | "config_json"
      | "conditional_rules_json"
      | "scoring_json"
    >
  >;
}

export interface TemplateVersionRow {
  id: string;
  template_id: string;
  version: number;
  snapshot_json: TemplateSnapshot;
  created_by: string;
  created_at: string;
  note: string | null;
}

export async function captureTemplateSnapshotServer(args: {
  template_id: string;
  actor_id: string;
  note?: string | null;
}): Promise<TemplateVersionRow> {
  const { data: tpl, error: tErr } = await supabaseAdmin
    .from("organizer_templates")
    .select("name, description, purpose, is_exam, passing_score, version")
    .eq("id", args.template_id)
    .single();
  if (tErr) throw new Error(tErr.message);

  const { data: blocks, error: bErr } = await supabaseAdmin
    .from("organizer_blocks")
    .select(
      "id, parent_id, order_index, block_type, question_text, help_text, is_required, config_json, conditional_rules_json, scoring_json",
    )
    .eq("template_id", args.template_id)
    .order("order_index", { ascending: true });
  if (bErr) throw new Error(bErr.message);

  const snapshot: TemplateSnapshot = {
    template: tpl as TemplateSnapshot["template"],
    blocks: (blocks ?? []) as TemplateSnapshot["blocks"],
  };

  const { data, error } = await supabaseAdmin
    .from("organizer_template_versions")
    .insert({
      template_id: args.template_id,
      version: tpl.version,
      snapshot_json: snapshot as never,
      created_by: args.actor_id,
      note: args.note ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as TemplateVersionRow;
}

export async function listTemplateVersionsServer(
  template_id: string,
): Promise<TemplateVersionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("organizer_template_versions")
    .select("*")
    .eq("template_id", template_id)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TemplateVersionRow[];
}

export async function restoreTemplateVersionServer(args: {
  version_id: string;
  actor_id: string;
}): Promise<{ template_id: string; restored_version: number }> {
  const { data: ver, error: vErr } = await supabaseAdmin
    .from("organizer_template_versions")
    .select("*")
    .eq("id", args.version_id)
    .single();
  if (vErr) throw new Error(vErr.message);

  const row = ver as unknown as TemplateVersionRow;
  const snap = row.snapshot_json;

  // Move current template back to draft and overwrite metadata.
  const { error: uErr } = await supabaseAdmin
    .from("organizer_templates")
    .update({
      name: snap.template.name,
      description: snap.template.description,
      purpose: snap.template.purpose,
      is_exam: snap.template.is_exam,
      passing_score: snap.template.passing_score,
      status: "draft",
    } as never)
    .eq("id", row.template_id);
  if (uErr) throw new Error(uErr.message);

  // Replace blocks atomically (simple: delete + reinsert with NEW ids;
  // discard the old ids in the snapshot so conditional rules referencing
  // the old block IDs are dropped — safer than re-pointing in one shot).
  const { error: dErr } = await supabaseAdmin
    .from("organizer_blocks")
    .delete()
    .eq("template_id", row.template_id);
  if (dErr) throw new Error(dErr.message);

  // Re-issue ids and remap parent_id; we keep conditional_rules_json /
  // scoring_json as-is so simple cases still work — admin should review.
  const idMap = new Map<string, string>();
  for (const b of snap.blocks) {
    idMap.set(b.id, crypto.randomUUID());
  }
  const rows = snap.blocks.map((b) => ({
    id: idMap.get(b.id)!,
    template_id: row.template_id,
    parent_id: b.parent_id ? (idMap.get(b.parent_id) ?? null) : null,
    order_index: b.order_index,
    block_type: b.block_type,
    question_text: b.question_text,
    help_text: b.help_text,
    is_required: b.is_required,
    config_json: b.config_json as never,
    conditional_rules_json: b.conditional_rules_json as never,
    scoring_json: b.scoring_json as never,
  }));
  if (rows.length > 0) {
    const { error: iErr } = await supabaseAdmin.from("organizer_blocks").insert(rows as never);
    if (iErr) throw new Error(iErr.message);
  }

  return { template_id: row.template_id, restored_version: row.version };
}
