/**
 * Server-only helpers for deployments + responses.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  DeploymentStatus,
  JsonObject,
  OrganizerBlock,
  OrganizerTemplate,
  TargetType,
} from "./schemas";
import { computeVisibleBlockIds } from "./evaluate-rules";

export interface OrganizerDeployment {
  id: string;
  template_id: string;
  template_version: number;
  target_type: TargetType;
  target_id: string;
  assignee_profile_id: string;
  assigned_by: string;
  firm_id: string | null;
  status: DeploymentStatus;
  due_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  score_breakdown_json: JsonObject | null;
  last_visited_block_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizerResponseRow {
  id: string;
  deployment_id: string;
  block_id: string;
  value_json: JsonObject | null;
  is_skipped: boolean;
  answered_at: string;
  answered_by: string;
}

export async function createDeploymentServer(args: {
  template_id: string;
  target_type: TargetType;
  target_id: string;
  assignee_profile_id: string;
  assigned_by: string;
  due_at?: string | null;
  firm_id?: string | null;
}): Promise<OrganizerDeployment> {
  // Pin template version snapshot.
  const { data: tpl, error: tplErr } = await supabaseAdmin
    .from("organizer_templates")
    .select("id, version, status")
    .eq("id", args.template_id)
    .single();
  if (tplErr) throw new Error(tplErr.message);
  if (tpl.status !== "published") {
    throw new Error("Only published templates can be deployed");
  }

  const { data, error } = await supabaseAdmin
    .from("organizer_deployments")
    .insert({
      template_id: args.template_id,
      template_version: tpl.version,
      target_type: args.target_type,
      target_id: args.target_id,
      assignee_profile_id: args.assignee_profile_id,
      assigned_by: args.assigned_by,
      due_at: args.due_at ?? null,
      firm_id: args.firm_id ?? null,
      status: "not_started" satisfies DeploymentStatus,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const deployment = data as unknown as OrganizerDeployment;

  // Notify assignee
  await supabaseAdmin.from("notifications").insert({
    user_id: args.assignee_profile_id,
    kind: "organizer_assigned",
    title: "New organizer assigned",
    body: args.due_at ? `Due ${new Date(args.due_at).toLocaleDateString()}` : "Open it to begin",
    url: `/organizer/r/${deployment.id}`,
    firm_id: args.firm_id ?? null,
  } as never);

  return deployment;
}

export async function getDeploymentForRespondentServer(deploymentId: string): Promise<{
  deployment: OrganizerDeployment;
  template: OrganizerTemplate;
  blocks: OrganizerBlock[];
  responses: OrganizerResponseRow[];
}> {
  const { data: dep, error: dErr } = await supabaseAdmin
    .from("organizer_deployments")
    .select("*")
    .eq("id", deploymentId)
    .single();
  if (dErr) throw new Error(dErr.message);

  const [tplRes, blocksRes, respRes] = await Promise.all([
    supabaseAdmin.from("organizer_templates").select("*").eq("id", dep.template_id).single(),
    supabaseAdmin
      .from("organizer_blocks")
      .select("*")
      .eq("template_id", dep.template_id)
      .order("order_index", { ascending: true }),
    supabaseAdmin.from("organizer_responses").select("*").eq("deployment_id", deploymentId),
  ]);
  if (tplRes.error) throw new Error(tplRes.error.message);
  if (blocksRes.error) throw new Error(blocksRes.error.message);
  if (respRes.error) throw new Error(respRes.error.message);

  return {
    deployment: dep as unknown as OrganizerDeployment,
    template: tplRes.data as unknown as OrganizerTemplate,
    blocks: (blocksRes.data ?? []) as unknown as OrganizerBlock[],
    responses: (respRes.data ?? []) as unknown as OrganizerResponseRow[],
  };
}

export async function saveResponseServer(args: {
  deployment_id: string;
  block_id: string;
  value_json: JsonObject | null;
  answered_by: string;
  last_visited_block_id?: string | null;
}): Promise<OrganizerResponseRow> {
  // Verify deployment is editable
  const { data: dep, error: dErr } = await supabaseAdmin
    .from("organizer_deployments")
    .select("id, status, assignee_profile_id")
    .eq("id", args.deployment_id)
    .single();
  if (dErr) throw new Error(dErr.message);
  if (dep.assignee_profile_id !== args.answered_by) {
    throw new Error("Only the assignee can save responses");
  }
  if (!["not_started", "in_progress", "returned"].includes(dep.status)) {
    throw new Error(`Deployment is ${dep.status} — responses are read-only`);
  }

  const { data, error } = await supabaseAdmin
    .from("organizer_responses")
    .upsert(
      {
        deployment_id: args.deployment_id,
        block_id: args.block_id,
        value_json: args.value_json as never,
        answered_by: args.answered_by,
        answered_at: new Date().toISOString(),
        is_skipped: false,
      },
      { onConflict: "deployment_id,block_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  // Touch deployment status / last visited
  const patch: Record<string, unknown> = {};
  if (dep.status === "not_started") patch.status = "in_progress";
  if (args.last_visited_block_id !== undefined)
    patch.last_visited_block_id = args.last_visited_block_id;
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin
      .from("organizer_deployments")
      .update(patch as never)
      .eq("id", args.deployment_id);
  }

  return data as unknown as OrganizerResponseRow;
}

export async function submitDeploymentServer(args: {
  deployment_id: string;
  actor_id: string;
}): Promise<OrganizerDeployment> {
  const ctx = await getDeploymentForRespondentServer(args.deployment_id);
  if (ctx.deployment.assignee_profile_id !== args.actor_id) {
    throw new Error("Only the assignee can submit");
  }
  if (!["not_started", "in_progress", "returned"].includes(ctx.deployment.status)) {
    throw new Error(`Already ${ctx.deployment.status}`);
  }

  // Re-evaluate visibility server-side and check required answers.
  const answers = new Map<string, unknown>();
  for (const r of ctx.responses) {
    answers.set(r.block_id, r.value_json);
  }
  const visible = computeVisibleBlockIds(ctx.blocks, answers);

  const missing: string[] = [];
  for (const b of ctx.blocks) {
    if (!b.is_required) continue;
    if (b.block_type === "section" || b.block_type === "info") continue;
    if (!visible.has(b.id)) continue;
    const resp = ctx.responses.find((r) => r.block_id === b.id);
    if (!resp || resp.value_json === null) {
      missing.push(b.question_text || b.id);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Cannot submit — ${missing.length} required question(s) unanswered: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`,
    );
  }

  // Flag hidden blocks as is_skipped (best-effort cleanup).
  for (const b of ctx.blocks) {
    if (visible.has(b.id)) continue;
    const existing = ctx.responses.find((r) => r.block_id === b.id);
    if (existing) {
      await supabaseAdmin
        .from("organizer_responses")
        .update({ is_skipped: true })
        .eq("id", existing.id);
    }
  }

  const nextStatus: DeploymentStatus = ctx.template.is_exam ? "under_review" : "submitted";
  const { data, error } = await supabaseAdmin
    .from("organizer_deployments")
    .update({
      status: nextStatus,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", args.deployment_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as OrganizerDeployment;
}

export interface InboxDeployment extends OrganizerDeployment {
  template_name: string | null;
  template_purpose: string | null;
  is_exam: boolean | null;
}

export async function listMyDeploymentsServer(userId: string): Promise<InboxDeployment[]> {
  const { data, error } = await supabaseAdmin
    .from("organizer_deployments")
    .select("*, organizer_templates ( name, purpose, is_exam )")
    .eq("assignee_profile_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as unknown as Array<
      OrganizerDeployment & {
        organizer_templates: { name: string; purpose: string; is_exam: boolean } | null;
      }
    >
  ).map((row) => {
    const { organizer_templates, ...rest } = row;
    return {
      ...rest,
      template_name: organizer_templates?.name ?? null,
      template_purpose: organizer_templates?.purpose ?? null,
      is_exam: organizer_templates?.is_exam ?? null,
    };
  });
}
