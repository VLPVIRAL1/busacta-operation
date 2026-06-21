import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleKey } from "@/lib/routing/use-nav";

/**
 * System-wide settings stored as a single JSON blob in `app_settings` (id = "system").
 * The /admin/settings page edits this across several tabs, each of which saves
 * independently — see {@link saveAppSettingsPatch}, which fetch-merges so one tab's
 * save never clobbers the keys owned by another tab.
 */
export type SystemSettings = {
  company_name: string;
  support_email: string;
  default_timezone: string;
  time_edit_window_min: number;
  default_billable: boolean;
  idle_warning_min: number;
  timer_auto_stop_minutes: number;
  open_point_default_visible: boolean;
  notify_on_mention: boolean;
  notify_on_status_change: boolean;
  pipeline_archive_days: number;
  module_hubs: Partial<Record<ModuleKey, boolean>>;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  company_name: "",
  support_email: "",
  default_timezone: "America/New_York",
  time_edit_window_min: 30,
  default_billable: true,
  idle_warning_min: 60,
  timer_auto_stop_minutes: 120,
  open_point_default_visible: true,
  notify_on_mention: true,
  notify_on_status_change: true,
  pipeline_archive_days: 14,
  module_hubs: {},
};

/** Normalise a stored (partial) settings blob into a fully-populated form value. */
export function normalizeSystemSettings(stored: Partial<SystemSettings> | null): SystemSettings {
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...(stored ?? {}),
    module_hubs: (stored?.module_hubs ?? {}) as Partial<Record<ModuleKey, boolean>>,
  };
}

export const appSettingsQuery = () =>
  queryOptions({
    queryKey: ["app-settings", "system"],
    queryFn: async (): Promise<Partial<SystemSettings>> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("id", "system")
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? {}) as Partial<SystemSettings>;
    },
  });

/**
 * Persist only the keys in `patch`, merged over the latest stored value.
 * Fetch-then-merge guarantees a per-tab save never overwrites keys owned by
 * another tab, even if that tab was edited and saved in between.
 */
export async function saveAppSettingsPatch(patch: Partial<SystemSettings>): Promise<void> {
  const { data, error: readError } = await supabase
    .from("app_settings")
    .select("value")
    .eq("id", "system")
    .maybeSingle();
  if (readError) throw readError;

  const current = (data?.value ?? {}) as Partial<SystemSettings>;
  const merged = { ...current, ...patch };

  const { error } = await supabase
    .from("app_settings")
    .upsert({ id: "system", value: merged as never, updated_at: new Date().toISOString() });
  if (error) throw error;
}
