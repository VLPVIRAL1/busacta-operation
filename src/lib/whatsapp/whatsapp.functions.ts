// Server functions for the Admin → WhatsApp settings page and per-user prefs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { testWhatsAppConnection } from "./client.server";

const INTEGRATION_KEY = "meta_whatsapp";

// ── Helpers ────────────────────────────────────────────────────────────────

async function assertAdmin(supabase: unknown, userId: string) {
  const sb = supabase as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (c: string, v: string) => { in: (c: string, v: string[]) => Promise<{ data: { role: string }[] | null; error: { message: string } | null }> };
      };
    };
  };
  const { data, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden");
}

// ── Admin: read config ─────────────────────────────────────────────────────

export type WhatsAppAdminConfig = {
  app_id: string;
  phone_number_id: string;
  access_token_hint: string; // masked – last 4 chars
  notify_on_assigned: boolean;
  notify_on_status: boolean;
  notify_on_commented: boolean;
  notify_on_due_soon: boolean;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
};

export const getWhatsAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsAppAdminConfig | null> => {
    await assertAdmin(context.supabase, context.userId);

    const { data, error } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active, last_tested_at, last_test_status, last_test_error")
      .eq("integration_key", INTEGRATION_KEY)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as {
      config: Record<string, string>;
      is_active: boolean;
      last_tested_at: string | null;
      last_test_status: string | null;
      last_test_error: string | null;
    };
    const cfg = row.config ?? {};
    const token = cfg.access_token ?? "";

    return {
      app_id: cfg.app_id ?? "",
      phone_number_id: cfg.phone_number_id ?? "",
      access_token_hint: token.length > 4 ? `••••${token.slice(-4)}` : token ? "••••" : "",
      notify_on_assigned: cfg.notify_on_assigned !== "false",
      notify_on_status: cfg.notify_on_status !== "false",
      notify_on_commented: cfg.notify_on_commented !== "false",
      notify_on_due_soon: cfg.notify_on_due_soon !== "false",
      is_active: row.is_active,
      last_tested_at: row.last_tested_at,
      last_test_status: row.last_test_status,
      last_test_error: row.last_test_error,
    };
  });

// ── Admin: save config ─────────────────────────────────────────────────────

const SaveSchema = z.object({
  app_id: z.string().trim().max(64),
  phone_number_id: z.string().trim().min(1, "Phone Number ID is required").max(64),
  access_token: z.string().max(512).optional(),
  notify_on_assigned: z.boolean(),
  notify_on_status: z.boolean(),
  notify_on_commented: z.boolean(),
  notify_on_due_soon: z.boolean(),
  is_active: z.boolean(),
});

export const saveWhatsAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Preserve existing auth_token if not provided
    const { data: existing } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config")
      .eq("integration_key", INTEGRATION_KEY)
      .maybeSingle();

    const existingToken =
      (existing as { config?: Record<string, string> } | null)?.config?.access_token ?? "";
    const nextToken =
      data.access_token && data.access_token.trim() ? data.access_token.trim() : existingToken;

    const newConfig = {
      app_id: data.app_id,
      phone_number_id: data.phone_number_id,
      access_token: nextToken,
      notify_on_assigned: String(data.notify_on_assigned),
      notify_on_status: String(data.notify_on_status),
      notify_on_commented: String(data.notify_on_commented),
      notify_on_due_soon: String(data.notify_on_due_soon),
    };

    const { error } = await supabaseAdmin
      .from("integration_credentials" as never)
      .upsert({
        integration_key: INTEGRATION_KEY,
        display_name: "Meta WhatsApp Cloud API",
        config: newConfig,
        is_active: data.is_active,
        updated_by: context.userId,
      } as never);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Admin: test connection ─────────────────────────────────────────────────

export const testWhatsAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        test_phone: z
          .string()
          .trim()
          .regex(/^\+[1-9]\d{6,14}$/, "Must be E.164, e.g. +14155551234"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const result = await testWhatsAppConnection(data.test_phone);

    await supabaseAdmin
      .from("integration_credentials" as never)
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: result.ok ? "ok" : "failed",
        last_test_error: result.ok ? null : (result as { ok: false; error: string }).error,
      } as never)
      .eq("integration_key", INTEGRATION_KEY);

    return result;
  });

// ── Admin: queue stats ─────────────────────────────────────────────────────

export const getWhatsAppQueueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pending, sentToday, failed] = await Promise.all([
      supabaseAdmin
        .from("whatsapp_notification_queue" as never)
        .select("id", { count: "exact", head: true })
        .is("sent_at", null)
        .is("error", null),
      supabaseAdmin
        .from("whatsapp_notification_queue" as never)
        .select("id", { count: "exact", head: true })
        .not("sent_at", "is", null)
        .gte("sent_at", todayStart.toISOString()),
      supabaseAdmin
        .from("whatsapp_notification_queue" as never)
        .select("id", { count: "exact", head: true })
        .not("error", "is", null),
    ]);

    return {
      pending: pending.count ?? 0,
      sent_today: sentToday.count ?? 0,
      failed: failed.count ?? 0,
    };
  });

// ── User: get own notification prefs ──────────────────────────────────────

export const getMyWhatsAppPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("whatsapp_notification_prefs" as never)
      .select("enabled, notify_on_assigned, notify_on_status, notify_on_commented, notify_on_due_soon")
      .eq("user_id", context.userId)
      .maybeSingle();

    // Default: everything on
    const row = (data ?? {}) as Record<string, boolean>;
    return {
      enabled: row.enabled ?? true,
      notify_on_assigned: row.notify_on_assigned ?? true,
      notify_on_status: row.notify_on_status ?? true,
      notify_on_commented: row.notify_on_commented ?? true,
      notify_on_due_soon: row.notify_on_due_soon ?? true,
    };
  });

// ── User: save own notification prefs ─────────────────────────────────────

const PrefsSchema = z.object({
  enabled: z.boolean(),
  notify_on_assigned: z.boolean(),
  notify_on_status: z.boolean(),
  notify_on_commented: z.boolean(),
  notify_on_due_soon: z.boolean(),
});

export const saveMyWhatsAppPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PrefsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("whatsapp_notification_prefs" as never)
      .upsert({
        user_id: context.userId,
        ...data,
        updated_at: new Date().toISOString(),
      } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
