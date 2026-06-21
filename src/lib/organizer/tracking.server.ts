/**
 * Admin-side tracking: list & review deployments across the company.
 * Uses supabaseAdmin — callers are gated by can_manage_organizer in functions layer.
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
import type { OrganizerDeployment, OrganizerResponseRow } from "./deployments.server";

export interface DeploymentRow extends OrganizerDeployment {
  template_name: string;
  template_is_exam: boolean;
  assignee_name: string | null;
  assignee_email: string | null;
}

export async function listAllDeploymentsServer(filters: {
  status?: DeploymentStatus | null;
  template_id?: string | null;
  target_type?: TargetType | null;
  search?: string | null;
}): Promise<DeploymentRow[]> {
  let q = supabaseAdmin
    .from("organizer_deployments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.template_id) q = q.eq("template_id", filters.template_id);
  if (filters.target_type) q = q.eq("target_type", filters.target_type);

  const { data: deps, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (deps ?? []) as unknown as OrganizerDeployment[];
  if (rows.length === 0) return [];

  const tplIds = Array.from(new Set(rows.map((r) => r.template_id)));
  const profIds = Array.from(new Set(rows.map((r) => r.assignee_profile_id)));

  const [tplRes, profRes] = await Promise.all([
    supabaseAdmin.from("organizer_templates").select("id, name, is_exam").in("id", tplIds),
    supabaseAdmin.from("profiles").select("id, full_name, email").in("id", profIds),
  ]);
  if (tplRes.error) throw new Error(tplRes.error.message);
  if (profRes.error) throw new Error(profRes.error.message);

  const tplMap = new Map(
    (tplRes.data ?? []).map((t: { id: string; name: string; is_exam: boolean }) => [t.id, t]),
  );
  const profMap = new Map(
    (profRes.data ?? []).map(
      (p: { id: string; full_name: string | null; email: string | null }) => [p.id, p],
    ),
  );

  const out: DeploymentRow[] = rows.map((r) => {
    const t = tplMap.get(r.template_id);
    const p = profMap.get(r.assignee_profile_id);
    return {
      ...r,
      template_name: t?.name ?? "(unknown template)",
      template_is_exam: t?.is_exam ?? false,
      assignee_name: p?.full_name ?? null,
      assignee_email: p?.email ?? null,
    };
  });

  if (filters.search?.trim()) {
    const needle = filters.search.trim().toLowerCase();
    return out.filter(
      (r) =>
        r.template_name.toLowerCase().includes(needle) ||
        (r.assignee_name ?? "").toLowerCase().includes(needle) ||
        (r.assignee_email ?? "").toLowerCase().includes(needle),
    );
  }
  return out;
}

export interface ReviewAuditEntry {
  id: string;
  action: string;
  actor_id: string;
  actor_name: string | null;
  notes: string | null;
  snapshot_json: JsonObject | null;
  created_at: string;
}

export interface ReviewContext {
  deployment: DeploymentRow;
  template: OrganizerTemplate;
  blocks: OrganizerBlock[];
  responses: OrganizerResponseRow[];
  visible_block_ids: string[];
  computed_score: number | null;
  max_score: number | null;
  per_block_score: Array<{
    block_id: string;
    earned: number;
    possible: number;
    correct: boolean | null;
    reviewer_note?: string | null;
  }>;
  audit_log: ReviewAuditEntry[];
}

export async function getDeploymentForReviewServer(deploymentId: string): Promise<ReviewContext> {
  const { data: dep, error: dErr } = await supabaseAdmin
    .from("organizer_deployments")
    .select("*")
    .eq("id", deploymentId)
    .single();
  if (dErr) throw new Error(dErr.message);
  const deployment = dep as unknown as OrganizerDeployment;

  const [tplRes, blocksRes, respRes, profRes, scoresRes, auditRes] = await Promise.all([
    supabaseAdmin.from("organizer_templates").select("*").eq("id", deployment.template_id).single(),
    supabaseAdmin
      .from("organizer_blocks")
      .select("*")
      .eq("template_id", deployment.template_id)
      .order("order_index", { ascending: true }),
    supabaseAdmin.from("organizer_responses").select("*").eq("deployment_id", deploymentId),
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", deployment.assignee_profile_id)
      .maybeSingle(),
    supabaseAdmin
      .from("organizer_block_scores")
      .select("block_id, earned, possible, is_correct, reviewer_note")
      .eq("deployment_id", deploymentId),
    supabaseAdmin
      .from("organizer_review_audit_log")
      .select("id, action, actor_id, notes, snapshot_json, created_at")
      .eq("deployment_id", deploymentId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (tplRes.error) throw new Error(tplRes.error.message);
  if (blocksRes.error) throw new Error(blocksRes.error.message);
  if (respRes.error) throw new Error(respRes.error.message);

  const template = tplRes.data as unknown as OrganizerTemplate;
  const blocks = (blocksRes.data ?? []) as unknown as OrganizerBlock[];
  const responses = (respRes.data ?? []) as unknown as OrganizerResponseRow[];
  const tplMeta = { name: template.name, is_exam: template.is_exam };

  const answers = new Map<string, unknown>();
  for (const r of responses) answers.set(r.block_id, r.value_json);
  const visible = computeVisibleBlockIds(blocks, answers);

  const persistedScores = new Map(
    (
      (scoresRes.data ?? []) as Array<{
        block_id: string;
        earned: number;
        possible: number;
        is_correct: boolean | null;
        reviewer_note: string | null;
      }>
    ).map((s) => [s.block_id, s]),
  );

  // Scoring (only meaningful for exams). Persisted reviewer overrides win.
  const perBlock: ReviewContext["per_block_score"] = [];
  let earned = 0;
  let possible = 0;
  for (const b of blocks) {
    const s = (b.scoring_json ?? null) as { points?: number; correct?: unknown } | null;
    if (!s || !s.points) continue;
    if (!visible.has(b.id)) continue;
    const persisted = persistedScores.get(b.id);
    if (persisted) {
      possible += Number(persisted.possible) || 0;
      earned += Number(persisted.earned) || 0;
      perBlock.push({
        block_id: b.id,
        earned: Number(persisted.earned) || 0,
        possible: Number(persisted.possible) || 0,
        correct: persisted.is_correct,
        reviewer_note: persisted.reviewer_note,
      });
      continue;
    }
    possible += Number(s.points) || 0;
    const resp = responses.find((r) => r.block_id === b.id);
    let correct: boolean | null = null;
    if (resp && resp.value_json !== null) {
      correct = isCorrect(resp.value_json as unknown, s.correct, b.block_type);
      if (correct) earned += Number(s.points) || 0;
    }
    perBlock.push({
      block_id: b.id,
      earned: correct ? Number(s.points) || 0 : 0,
      possible: Number(s.points) || 0,
      correct,
    });
  }

  // Hydrate actor names for audit log
  const auditRows = (auditRes.data ?? []) as Array<{
    id: string;
    action: string;
    actor_id: string;
    notes: string | null;
    snapshot_json: JsonObject | null;
    created_at: string;
  }>;
  const actorIds = Array.from(new Set(auditRows.map((a) => a.actor_id)));
  const actorMap = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: actors } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const a of (actors ?? []) as Array<{ id: string; full_name: string | null }>) {
      actorMap.set(a.id, a.full_name);
    }
  }
  const audit_log: ReviewAuditEntry[] = auditRows.map((a) => ({
    ...a,
    actor_name: actorMap.get(a.actor_id) ?? null,
  }));

  return {
    deployment: {
      ...deployment,
      template_name: tplMeta.name,
      template_is_exam: tplMeta.is_exam,
      assignee_name: profRes.data?.full_name ?? null,
      assignee_email: profRes.data?.email ?? null,
    },
    template,
    blocks,
    responses,
    visible_block_ids: Array.from(visible),
    computed_score: template.is_exam ? earned : null,
    max_score: template.is_exam ? possible : null,
    per_block_score: perBlock,
    audit_log,
  };
}

function isCorrect(value: unknown, expected: unknown, blockType: string): boolean {
  if (expected === undefined || expected === null) return false;
  if (blockType === "yes_no") return Boolean(value) === Boolean(expected);
  if (blockType === "multi_choice") {
    const v = Array.isArray(value) ? value : [];
    const e = Array.isArray(expected) ? expected : [];
    if (v.length !== e.length) return false;
    return v.every((x) => e.includes(x));
  }
  if (typeof value === "string" && typeof expected === "string") {
    return value.trim().toLowerCase() === expected.trim().toLowerCase();
  }
  return value === expected;
}

export async function gradeDeploymentServer(args: {
  deployment_id: string;
  actor_id: string;
  score: number;
  breakdown: JsonObject;
  notes?: string | null;
  per_block?: Array<{
    block_id: string;
    earned: number;
    possible: number;
    is_correct?: boolean | null;
    reviewer_note?: string | null;
  }>;
}): Promise<DeploymentRow> {
  const { error } = await supabaseAdmin
    .from("organizer_deployments")
    .update({
      status: "graded" satisfies DeploymentStatus,
      graded_at: new Date().toISOString(),
      score: args.score,
      score_breakdown_json: args.breakdown as never,
      notes: args.notes ?? null,
    })
    .eq("id", args.deployment_id);
  if (error) throw new Error(error.message);

  // Persist per-block score rows (upsert) when provided.
  if (args.per_block && args.per_block.length > 0) {
    const rows = args.per_block.map((p) => ({
      deployment_id: args.deployment_id,
      block_id: p.block_id,
      earned: p.earned,
      possible: p.possible,
      is_correct: p.is_correct ?? null,
      reviewer_note: p.reviewer_note ?? null,
      graded_by: args.actor_id,
      graded_at: new Date().toISOString(),
    }));
    const { error: scErr } = await supabaseAdmin
      .from("organizer_block_scores")
      .upsert(rows as never, { onConflict: "deployment_id,block_id" });
    if (scErr) throw new Error(scErr.message);
  }

  // Audit log
  await supabaseAdmin.from("organizer_review_audit_log").insert({
    deployment_id: args.deployment_id,
    action: "graded",
    actor_id: args.actor_id,
    notes: args.notes ?? null,
    snapshot_json: { score: args.score, breakdown: args.breakdown } as never,
  } as never);

  const ctx = await getDeploymentForReviewServer(args.deployment_id);
  await supabaseAdmin.from("notifications").insert({
    user_id: ctx.deployment.assignee_profile_id,
    kind: "organizer_graded",
    title: `Organizer graded: ${ctx.template.name}`,
    body:
      ctx.template.is_exam && ctx.max_score
        ? `Score: ${args.score} / ${ctx.max_score}`
        : "Reviewed by admin",
    url: `/organizer/r/${args.deployment_id}`,
    firm_id: ctx.deployment.firm_id,
  } as never);
  return ctx.deployment;
}

export async function returnDeploymentServer(args: {
  deployment_id: string;
  actor_id: string;
  notes?: string | null;
}): Promise<DeploymentRow> {
  const { error } = await supabaseAdmin
    .from("organizer_deployments")
    .update({
      status: "returned" satisfies DeploymentStatus,
      notes: args.notes ?? null,
    })
    .eq("id", args.deployment_id);
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("organizer_review_audit_log").insert({
    deployment_id: args.deployment_id,
    action: "returned",
    actor_id: args.actor_id,
    notes: args.notes ?? null,
    snapshot_json: null,
  } as never);

  const ctx = await getDeploymentForReviewServer(args.deployment_id);
  await supabaseAdmin.from("notifications").insert({
    user_id: ctx.deployment.assignee_profile_id,
    kind: "organizer_returned",
    title: `Organizer returned: ${ctx.template.name}`,
    body: args.notes?.slice(0, 140) ?? "Admin requested changes",
    url: `/organizer/r/${args.deployment_id}`,
    firm_id: ctx.deployment.firm_id,
  } as never);
  return ctx.deployment;
}

/**
 * Admin edit: reassign respondent, change due date, or force a status
 * transition. All three are optional — only provided fields are written.
 * Status transitions are clamped to the published state machine.
 */
const STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  not_started: ["in_progress", "cancelled"],
  in_progress: ["not_started", "submitted", "cancelled"],
  submitted: ["in_progress", "under_review", "returned", "graded", "cancelled"],
  under_review: ["in_progress", "submitted", "returned", "graded", "cancelled"],
  graded: ["in_progress", "under_review", "returned"],
  returned: ["in_progress", "submitted", "cancelled"],
  cancelled: ["not_started", "in_progress"],
};

export async function updateDeploymentAssignmentServer(args: {
  deployment_id: string;
  actor_id: string;
  assignee_profile_id?: string;
  due_at?: string | null;
  status?: DeploymentStatus | "cancelled";
}): Promise<DeploymentRow> {
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("organizer_deployments")
    .select("id, status, assignee_profile_id, firm_id, template_id")
    .eq("id", args.deployment_id)
    .single();
  if (exErr) throw new Error(exErr.message);
  const row = existing as {
    status: string;
    assignee_profile_id: string;
    firm_id: string | null;
    template_id: string;
  };

  const patch: Record<string, unknown> = {};
  let reassignedTo: string | null = null;

  if (args.assignee_profile_id && args.assignee_profile_id !== row.assignee_profile_id) {
    patch.assignee_profile_id = args.assignee_profile_id;
    reassignedTo = args.assignee_profile_id;
  }

  if (args.due_at !== undefined) {
    patch.due_at = args.due_at;
  }

  if (args.status && args.status !== row.status) {
    const allowed = STATUS_TRANSITIONS[row.status] ?? [];
    if (!allowed.includes(args.status)) {
      throw new Error(`Cannot transition from ${row.status} to ${args.status}`);
    }
    patch.status = args.status;
    if (args.status === "in_progress") {
      patch.submitted_at = null;
      patch.graded_at = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    // No-op — return current row in DeploymentRow shape.
    const ctx = await getDeploymentForReviewServer(args.deployment_id);
    return ctx.deployment;
  }

  const { error: upErr } = await supabaseAdmin
    .from("organizer_deployments")
    .update(patch as never)
    .eq("id", args.deployment_id);
  if (upErr) throw new Error(upErr.message);

  // Look up template name once for nicer copy.
  const { data: tpl } = await supabaseAdmin
    .from("organizer_templates")
    .select("name")
    .eq("id", row.template_id)
    .maybeSingle();
  const tplName = (tpl as { name?: string } | null)?.name ?? "organizer";

  // Notify on reassignment.
  if (reassignedTo) {
    await supabaseAdmin.from("notifications").insert({
      user_id: reassignedTo,
      kind: "organizer_assigned",
      title: `Assigned to you: ${tplName}`,
      body: "An admin assigned an organizer to you.",
      url: `/organizer/r/${args.deployment_id}`,
      firm_id: row.firm_id,
    } as never);
  }

  // Notify current assignee when status changes (excluding cancellation
  // which is its own conversation and reassignment which already pings the
  // new assignee).
  if (patch.status && !reassignedTo && patch.status !== "cancelled") {
    await supabaseAdmin.from("notifications").insert({
      user_id: row.assignee_profile_id,
      kind: "organizer_status_changed",
      title: `${tplName} → ${String(patch.status).replace("_", " ")}`,
      body: "An admin updated the status of your organizer.",
      url: `/organizer/r/${args.deployment_id}`,
      firm_id: row.firm_id,
    } as never);
  }

  const ctx = await getDeploymentForReviewServer(args.deployment_id);
  return ctx.deployment;
}
