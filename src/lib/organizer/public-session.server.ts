import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Look up a deployment by its anonymous session token. Returns null if not
 * found, revoked, or already submitted.
 */
export async function getDeploymentByAnonSession(sessionToken: string) {
  const { data, error } = await supabaseAdmin
    .from("organizer_deployments")
    .select("*")
    .eq("anon_session_token", sessionToken)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
