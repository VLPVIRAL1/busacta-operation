/**
 * Admin-side lifecycle ops: send reminder, reopen, cancel.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function sendReminderServer(args: { deployment_id: string; actor_id: string }) {
  const { data: dep, error } = await supabaseAdmin
    .from("organizer_deployments")
    .select("id, assignee_profile_id, firm_id, template_id, organizer_templates(name)")
    .eq("id", args.deployment_id)
    .single();
  if (error) throw new Error(error.message);
  const tpl = (dep as { organizer_templates?: { name?: string } | null }).organizer_templates;
  await supabaseAdmin.from("notifications").insert({
    user_id: (dep as { assignee_profile_id: string }).assignee_profile_id,
    kind: "organizer_reminder",
    title: `Reminder: ${tpl?.name ?? "organizer"}`,
    body: "Please complete and submit when ready.",
    url: `/organizer/r/${args.deployment_id}`,
    firm_id: (dep as { firm_id: string | null }).firm_id,
  } as never);
  return { ok: true };
}

export async function reopenDeploymentServer(args: { deployment_id: string }) {
  const { data: dep, error } = await supabaseAdmin
    .from("organizer_deployments")
    .select("id, status, assignee_profile_id, firm_id")
    .eq("id", args.deployment_id)
    .single();
  if (error) throw new Error(error.message);
  const row = dep as { status: string; assignee_profile_id: string; firm_id: string | null };
  if (!["submitted", "under_review", "graded", "returned"].includes(row.status)) {
    throw new Error(`Cannot reopen — status is ${row.status}`);
  }
  const { error: upErr } = await supabaseAdmin
    .from("organizer_deployments")
    .update({
      status: "in_progress",
      submitted_at: null,
      graded_at: null,
    } as never)
    .eq("id", args.deployment_id);
  if (upErr) throw new Error(upErr.message);
  await supabaseAdmin.from("notifications").insert({
    user_id: row.assignee_profile_id,
    kind: "organizer_reopened",
    title: "Organizer reopened",
    body: "An admin reopened your organizer for further edits.",
    url: `/organizer/r/${args.deployment_id}`,
    firm_id: row.firm_id,
  } as never);
  return { ok: true };
}

export async function cancelDeploymentServer(args: { deployment_id: string }) {
  const { error } = await supabaseAdmin
    .from("organizer_deployments")
    .update({ status: "cancelled" } as never)
    .eq("id", args.deployment_id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
