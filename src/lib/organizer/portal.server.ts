import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PortalDeploymentRow = {
  id: string;
  status: string;
  due_at: string | null;
  submitted_at: string | null;
  updated_at: string;
  template_name: string;
  template_version: number;
  firm_name: string | null;
};

/**
 * List organizer deployments assigned to the current portal user, enriched
 * with template name and firm name. Used by /portal/organizer.
 */
export async function listMyPortalDeploymentsServer(
  userId: string,
): Promise<PortalDeploymentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("organizer_deployments")
    .select(
      "id, status, due_at, submitted_at, updated_at, template_version, organizer_templates(name), firms(name)",
    )
    .eq("assignee_profile_id", userId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => {
    const tpl = (d as { organizer_templates?: { name?: string } | null }).organizer_templates;
    const firm = (d as { firms?: { name?: string } | null }).firms;
    return {
      id: d.id as string,
      status: d.status as string,
      due_at: (d.due_at as string | null) ?? null,
      submitted_at: (d.submitted_at as string | null) ?? null,
      updated_at: d.updated_at as string,
      template_name: tpl?.name ?? "Organizer",
      template_version: (d.template_version as number) ?? 1,
      firm_name: firm?.name ?? null,
    };
  });
}
