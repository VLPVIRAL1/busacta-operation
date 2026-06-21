// Server-only reader for Microsoft Graph credentials stored in the
// `integration_credentials` table (admin-editable, no env vars required).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MicrosoftGraphConfig = {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  tenant_domain: string; // e.g. "contoso" — the part before .sharepoint.com
  onenote_site_url?: string; // Full SharePoint site URL where employee notebooks are stored
  root_site_id?: string; // kept for backward compat (training file lookups); not required for provisioning
  training_folder_path?: string;
  // Per-feature sync switches. Absent = enabled (preserves behaviour for
  // configs saved before these toggles existed). Admins flip them off in
  // /admin/integration → Microsoft when a feature misbehaves (e.g. OneNote 401s).
  sharepoint_enabled?: boolean; // document-library folder/file sync
  sharepoint_lists_enabled?: boolean; // per-project backup Lists (Tasks/Messages/Audit/Documents)
  onenote_enabled?: boolean; // employee Daily Note → OneNote sync
};

/** A feature flag is on unless it has been explicitly set to false. */
export function isFeatureEnabled(value: boolean | undefined): boolean {
  return value !== false;
}

export async function loadMicrosoftGraphConfig(): Promise<MicrosoftGraphConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("integration_credentials" as never)
    .select("config, is_active")
    .eq("integration_key", "microsoft_graph")
    .maybeSingle();
  if (error) throw new Error(`Failed to load Graph config: ${error.message}`);
  if (!data) return null;
  const row = data as { config: Partial<MicrosoftGraphConfig>; is_active: boolean };
  if (!row.is_active) return null;
  const cfg = row.config ?? {};
  if (!cfg.tenant_id || !cfg.client_id || !cfg.client_secret || !cfg.tenant_domain) {
    return null;
  }
  return cfg as MicrosoftGraphConfig;
}
