import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invalidateTokenCache, testGraphConnection } from "./graph-client.server";

type AuthedSupabase = {
  from: (t: string) => {
    select: (s: string) => {
      eq: (
        c: string,
        v: string,
      ) => {
        in: (
          c: string,
          v: string[],
        ) => Promise<{ data: Array<{ role: string }> | null; error: { message: string } | null }>;
      };
    };
  };
};

async function assertAdmin(supabase: unknown, userId: string) {
  const sb = supabase as AuthedSupabase;
  const { data, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: admin role required");
}

export type IntegrationConfig = {
  integration_key: string;
  display_name: string;
  config: Record<string, string | boolean>;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  updated_at: string;
};

export const getIntegrationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { integration_key: string }) =>
    z.object({ integration_key: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<IntegrationConfig | null> => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select(
        "integration_key, display_name, config, is_active, last_tested_at, last_test_status, last_test_error, updated_at",
      )
      .eq("integration_key", data.integration_key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const cfg = row as unknown as IntegrationConfig;
    // Mask the secret for transport — return last 4 chars only.
    const secret = String(cfg.config?.client_secret ?? "");
    if (secret) {
      cfg.config = {
        ...cfg.config,
        client_secret: secret.length > 4 ? `••••${secret.slice(-4)}` : "••••",
      };
    }
    return cfg;
  });

const SaveSchema = z.object({
  integration_key: z.string().min(1).max(64),
  tenant_id: z.string().trim().max(128),
  client_id: z.string().trim().max(128),
  client_secret: z.string().max(512).optional(),
  tenant_domain: z.string().trim().max(128).optional(),
  onenote_site_url: z.string().trim().max(512).optional(),
  root_site_id: z.string().trim().max(256).optional(),
  training_folder_path: z.string().trim().max(512).optional(),
  is_active: z.boolean(),
  // Per-feature sync switches (default on when omitted).
  sharepoint_enabled: z.boolean().optional(),
  sharepoint_lists_enabled: z.boolean().optional(),
  onenote_enabled: z.boolean().optional(),
});

export const saveIntegrationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: existing } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config")
      .eq("integration_key", data.integration_key)
      .maybeSingle();
    const existingSecret =
      (existing as { config?: { client_secret?: string } } | null)?.config?.client_secret ?? "";
    const nextSecret =
      data.client_secret && data.client_secret.trim() ? data.client_secret.trim() : existingSecret;

    const newConfig = {
      tenant_id: data.tenant_id,
      client_id: data.client_id,
      client_secret: nextSecret,
      tenant_domain: data.tenant_domain ?? "",
      onenote_site_url: data.onenote_site_url ?? "",
      root_site_id: data.root_site_id ?? "",
      training_folder_path: data.training_folder_path ?? "",
      // Default to enabled (true) when the caller omits a flag.
      sharepoint_enabled: data.sharepoint_enabled ?? true,
      sharepoint_lists_enabled: data.sharepoint_lists_enabled ?? true,
      onenote_enabled: data.onenote_enabled ?? true,
    };

    const { error } = await supabaseAdmin.from("integration_credentials" as never).upsert({
      integration_key: data.integration_key,
      display_name:
        data.integration_key === "microsoft_graph"
          ? "Microsoft Graph / SharePoint"
          : data.integration_key,
      config: newConfig,
      is_active: data.is_active,
      updated_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    invalidateTokenCache();
    return { ok: true as const };
  });

export const testIntegrationConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { integration_key: string }) =>
    z.object({ integration_key: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.integration_key !== "microsoft_graph") {
      throw new Error(`Unknown integration: ${data.integration_key}`);
    }
    const result = await testGraphConnection();
    await supabaseAdmin
      .from("integration_credentials" as never)
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: result.ok ? "ok" : "failed",
        last_test_error: result.ok ? null : result.error,
      } as never)
      .eq("integration_key", data.integration_key);
    return result;
  });
