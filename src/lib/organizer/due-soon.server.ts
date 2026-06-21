import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Run by the daily cron. For every deployment whose due date is within the
 * next 48 hours and is not yet submitted, insert a `organizer_due_soon`
 * notification (deduped against the last 24h).
 */
export async function runDueSoonScanServer() {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const dedupeAfter = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: deps, error } = await supabaseAdmin
    .from("organizer_deployments")
    .select(
      "id, assignee_profile_id, due_at, firm_id, status, template_id, organizer_templates(name)",
    )
    .lte("due_at", cutoff)
    .gte("due_at", now.toISOString())
    .in("status", ["not_started", "in_progress", "returned"])
    .limit(1000);
  if (error) throw new Error(error.message);
  const rows = (deps ?? []) as Array<{
    id: string;
    assignee_profile_id: string;
    due_at: string;
    firm_id: string | null;
    organizer_templates?: { name?: string } | null;
  }>;

  let inserted = 0;
  for (const r of rows) {
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", r.assignee_profile_id)
      .eq("kind", "organizer_due_soon")
      .ilike("url", `%${r.id}%`)
      .gte("created_at", dedupeAfter)
      .limit(1);
    if (existing && existing.length > 0) continue;

    const dueDate = new Date(r.due_at);
    const hoursLeft = Math.max(
      0,
      Math.round((dueDate.getTime() - now.getTime()) / (60 * 60 * 1000)),
    );
    await supabaseAdmin.from("notifications").insert({
      user_id: r.assignee_profile_id,
      kind: "organizer_due_soon",
      title: `Due soon: ${r.organizer_templates?.name ?? "organizer"}`,
      body: `Submit within ${hoursLeft}h.`,
      url: `/organizer/r/${r.id}`,
      firm_id: r.firm_id,
    } as never);
    inserted++;
  }
  return { scanned: rows.length, inserted };
}
