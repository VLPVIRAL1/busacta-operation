import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TargetType } from "./schemas";

export async function createBulkDeploymentServer(args: {
  template_id: string;
  target_type: TargetType;
  assignments: Array<{ target_id: string; assignee_profile_id: string }>;
  assigned_by: string;
  due_at?: string | null;
  firm_id?: string | null;
  note?: string | null;
}) {
  if (args.assignments.length === 0) {
    throw new Error("At least one assignee is required");
  }

  // Pin template version
  const { data: tpl, error: tplErr } = await supabaseAdmin
    .from("organizer_templates")
    .select("id, version, status, name")
    .eq("id", args.template_id)
    .single();
  if (tplErr) throw new Error(tplErr.message);
  const t = tpl as { id: string; version: number; status: string; name: string };
  if (t.status !== "published") {
    throw new Error("Only published templates can be deployed");
  }

  // 1. Create campaign row
  const { data: campaign, error: cErr } = await supabaseAdmin
    .from("organizer_deployment_assignments")
    .insert({
      template_id: args.template_id,
      template_version: t.version,
      target_type: args.target_type,
      assigned_by: args.assigned_by,
      firm_id: args.firm_id ?? null,
      note: args.note ?? null,
      total_count: args.assignments.length,
    } as never)
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);
  const campaignId = (campaign as { id: string }).id;

  // 2. Create deployments
  const rows = args.assignments.map((a) => ({
    template_id: args.template_id,
    template_version: t.version,
    target_type: args.target_type,
    target_id: a.target_id,
    assignee_profile_id: a.assignee_profile_id,
    assigned_by: args.assigned_by,
    due_at: args.due_at ?? null,
    firm_id: args.firm_id ?? null,
    status: "not_started",
    campaign_id: campaignId,
  }));
  const { data: created, error: dErr } = await supabaseAdmin
    .from("organizer_deployments")
    .insert(rows as never)
    .select("id, assignee_profile_id");
  if (dErr) throw new Error(dErr.message);

  // 3. Notify
  const notifs = (created ?? [])
    .filter((d): d is { id: string; assignee_profile_id: string } => d.assignee_profile_id != null)
    .map((d) => ({
      user_id: d.assignee_profile_id,
      kind: "organizer_assigned",
      title: `New organizer: ${t.name}`,
      body: args.due_at ? `Due ${new Date(args.due_at).toLocaleDateString()}` : "Open it to begin",
      url: `/organizer/r/${d.id}`,
      firm_id: args.firm_id ?? null,
    }));

  if (notifs.length > 0) {
    await supabaseAdmin.from("notifications").insert(notifs as never);
  }

  return {
    campaign_id: campaignId,
    count: created?.length ?? 0,
  };
}
