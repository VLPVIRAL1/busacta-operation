import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface TrackingOverview {
  active: number;
  submitted_7d: number;
  overdue: number;
  avg_completion_pct: number;
}

export async function getTrackingOverviewServer(): Promise<TrackingOverview> {
  const nowIso = new Date().toISOString();
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("organizer_deployments")
    .select("id, status, due_at, submitted_at")
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    status: string;
    due_at: string | null;
    submitted_at: string | null;
  }>;

  let active = 0;
  let overdue = 0;
  let submitted7d = 0;
  let terminal = 0;
  let totalNonCancelled = 0;
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    totalNonCancelled++;
    if (r.status === "not_started" || r.status === "in_progress") active++;
    if (
      r.due_at &&
      r.due_at < nowIso &&
      ["not_started", "in_progress", "returned"].includes(r.status)
    ) {
      overdue++;
    }
    if (r.submitted_at && r.submitted_at >= sevenDaysAgoIso) submitted7d++;
    if (["submitted", "under_review", "graded"].includes(r.status)) terminal++;
  }
  const avg = totalNonCancelled === 0 ? 0 : Math.round((terminal / totalNonCancelled) * 100);

  return {
    active,
    submitted_7d: submitted7d,
    overdue,
    avg_completion_pct: avg,
  };
}
