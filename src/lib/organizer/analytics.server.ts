/**
 * Template analytics: completion funnel, avg time-per-section, drop-off blocks.
 * Admin-only (gated in functions layer via can_manage_organizer).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  DeploymentStatus,
  OrganizerBlock,
  OrganizerTemplate,
  OrganizerPurpose,
} from "./schemas";
import { computeVisibleBlockIds } from "./evaluate-rules";
import type { OrganizerDeployment, OrganizerResponseRow } from "./deployments.server";

export interface TemplateStatRow {
  id: string;
  name: string;
  purpose: OrganizerPurpose;
  is_exam: boolean;
  version: number;
  status: string;
  deployments: number;
  submitted: number;
  completion_rate: number; // 0..1
}

export async function listTemplatesWithStatsServer(): Promise<TemplateStatRow[]> {
  const [{ data: tpls, error: tErr }, { data: deps, error: dErr }] = await Promise.all([
    supabaseAdmin
      .from("organizer_templates")
      .select("id, name, purpose, is_exam, version, status")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabaseAdmin.from("organizer_deployments").select("template_id, status").limit(5000),
  ]);
  if (tErr) throw new Error(tErr.message);
  if (dErr) throw new Error(dErr.message);

  const counts = new Map<string, { total: number; submitted: number }>();
  for (const d of (deps ?? []) as Array<{
    template_id: string;
    status: DeploymentStatus;
  }>) {
    const c = counts.get(d.template_id) ?? { total: 0, submitted: 0 };
    c.total += 1;
    if (d.status === "submitted" || d.status === "graded" || d.status === "under_review")
      c.submitted += 1;
    counts.set(d.template_id, c);
  }

  return ((tpls ?? []) as unknown as TemplateStatRow[]).map((t) => {
    const c = counts.get(t.id) ?? { total: 0, submitted: 0 };
    return {
      ...t,
      deployments: c.total,
      submitted: c.submitted,
      completion_rate: c.total ? c.submitted / c.total : 0,
    };
  });
}

export interface SectionStat {
  section_id: string;
  section_title: string;
  question_count: number;
  avg_time_seconds: number | null;
  completion_rate: number;
}

export interface DropOffRow {
  block_id: string;
  question_text: string;
  section_title: string;
  block_type: string;
  shown_to: number;
  answered_by: number;
  drop_off_rate: number;
}

export interface TemplateAnalytics {
  template: OrganizerTemplate;
  funnel: Record<DeploymentStatus, number>;
  total_deployments: number;
  avg_submit_seconds: number | null;
  sections: SectionStat[];
  drop_off: DropOffRow[];
}

export async function getTemplateAnalyticsServer(templateId: string): Promise<TemplateAnalytics> {
  const [{ data: tpl, error: tErr }, { data: blocks, error: bErr }, { data: deps, error: dErr }] =
    await Promise.all([
      supabaseAdmin.from("organizer_templates").select("*").eq("id", templateId).single(),
      supabaseAdmin
        .from("organizer_blocks")
        .select("*")
        .eq("template_id", templateId)
        .order("order_index", { ascending: true }),
      supabaseAdmin
        .from("organizer_deployments")
        .select("*")
        .eq("template_id", templateId)
        .limit(5000),
    ]);
  if (tErr) throw new Error(tErr.message);
  if (bErr) throw new Error(bErr.message);
  if (dErr) throw new Error(dErr.message);

  const template = tpl as unknown as OrganizerTemplate;
  const allBlocks = (blocks ?? []) as unknown as OrganizerBlock[];
  const deployments = (deps ?? []) as unknown as OrganizerDeployment[];

  // Funnel
  const funnel: Record<DeploymentStatus, number> = {
    not_started: 0,
    in_progress: 0,
    submitted: 0,
    under_review: 0,
    graded: 0,
    returned: 0,
  };
  for (const d of deployments) funnel[d.status] += 1;

  // Avg submit time: created_at -> submitted_at
  const submitDurations: number[] = [];
  for (const d of deployments) {
    if (d.submitted_at) {
      const dur = (new Date(d.submitted_at).getTime() - new Date(d.created_at).getTime()) / 1000;
      if (dur > 0 && dur < 60 * 60 * 24 * 365) submitDurations.push(dur);
    }
  }
  const avgSubmit =
    submitDurations.length > 0
      ? submitDurations.reduce((a, b) => a + b, 0) / submitDurations.length
      : null;

  // Fetch responses for all deployments
  const depIds = deployments.map((d) => d.id);
  let responses: OrganizerResponseRow[] = [];
  if (depIds.length > 0) {
    const { data: respRows, error: rErr } = await supabaseAdmin
      .from("organizer_responses")
      .select("*")
      .in("deployment_id", depIds)
      .limit(50000);
    if (rErr) throw new Error(rErr.message);
    responses = (respRows ?? []) as unknown as OrganizerResponseRow[];
  }

  // Group responses by deployment
  const respByDep = new Map<string, OrganizerResponseRow[]>();
  for (const r of responses) {
    const arr = respByDep.get(r.deployment_id) ?? [];
    arr.push(r);
    respByDep.set(r.deployment_id, arr);
  }

  // Sections = blocks with block_type === 'section'
  const sections = allBlocks.filter((b) => b.block_type === "section");
  const childrenOf = (parentId: string) => allBlocks.filter((b) => b.parent_id === parentId);

  // Compute visible block id sets per deployment (using actual answers)
  const visibleByDep = new Map<string, Set<string>>();
  for (const d of deployments) {
    const answers = new Map<string, unknown>();
    for (const r of respByDep.get(d.id) ?? []) answers.set(r.block_id, r.value_json);
    visibleByDep.set(d.id, computeVisibleBlockIds(allBlocks, answers));
  }

  // Section stats
  const sectionStats: SectionStat[] = sections.map((s) => {
    const questionIds = childrenOf(s.id)
      .filter((b) => b.block_type !== "section" && b.block_type !== "info")
      .map((b) => b.id);
    if (questionIds.length === 0) {
      return {
        section_id: s.id,
        section_title: s.question_text ?? "(untitled section)",
        question_count: 0,
        avg_time_seconds: null,
        completion_rate: 0,
      };
    }
    const durations: number[] = [];
    let completed = 0;
    let eligible = 0;
    for (const d of deployments) {
      const visible = visibleByDep.get(d.id)!;
      const visibleQs = questionIds.filter((id) => visible.has(id));
      if (visibleQs.length === 0) continue;
      eligible += 1;
      const sectionResponses = (respByDep.get(d.id) ?? []).filter((r) =>
        visibleQs.includes(r.block_id),
      );
      if (sectionResponses.length >= visibleQs.length) completed += 1;
      if (sectionResponses.length >= 2) {
        const times = sectionResponses
          .map((r) => new Date(r.answered_at).getTime())
          .sort((a, b) => a - b);
        const dur = (times[times.length - 1] - times[0]) / 1000;
        if (dur > 0 && dur < 60 * 60 * 6) durations.push(dur);
      }
    }
    return {
      section_id: s.id,
      section_title: s.question_text ?? "(untitled section)",
      question_count: questionIds.length,
      avg_time_seconds:
        durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      completion_rate: eligible > 0 ? completed / eligible : 0,
    };
  });

  // Drop-off: per visible required question, ratio answered. Lower = worse.
  const sectionTitleByQ = new Map<string, string>();
  for (const s of sections) {
    for (const c of childrenOf(s.id))
      sectionTitleByQ.set(c.id, s.question_text ?? "(untitled section)");
  }
  const questionBlocks = allBlocks.filter(
    (b) =>
      b.is_required &&
      b.block_type !== "section" &&
      b.block_type !== "subsection" &&
      b.block_type !== "info",
  );
  // Only count deployments that have at least started.
  const activeDeps = deployments.filter((d) => d.status !== "not_started");
  const dropOff: DropOffRow[] = questionBlocks
    .map((b) => {
      let shown = 0;
      let answered = 0;
      for (const d of activeDeps) {
        if (!visibleByDep.get(d.id)?.has(b.id)) continue;
        shown += 1;
        const ans = (respByDep.get(d.id) ?? []).find((r) => r.block_id === b.id);
        if (ans && ans.value_json !== null) answered += 1;
      }
      return {
        block_id: b.id,
        question_text: b.question_text ?? "(untitled question)",
        section_title: sectionTitleByQ.get(b.id) ?? "—",
        block_type: b.block_type,
        shown_to: shown,
        answered_by: answered,
        drop_off_rate: shown > 0 ? 1 - answered / shown : 0,
      };
    })
    .filter((r) => r.shown_to > 0)
    .sort((a, b) => b.drop_off_rate - a.drop_off_rate)
    .slice(0, 15);

  return {
    template,
    funnel,
    total_deployments: deployments.length,
    avg_submit_seconds: avgSubmit,
    sections: sectionStats,
    drop_off: dropOff,
  };
}
