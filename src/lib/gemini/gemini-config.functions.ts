// Server functions for the Admin → Integration → Gemini settings.
// Gemini API credentials live in integration_credentials (key "gemini_api"),
// mirroring the WhatsApp / Microsoft integration pattern. The API key is stored
// server-side only and returned to the UI masked (••••1234).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyWithGemini, type GeminiModel } from "@/lib/ops/gemini-client";

const INTEGRATION_KEY = "gemini_api";

const GEMINI_MODEL_VALUES = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

async function assertAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles" as never)
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(`Role check failed: ${error.message}`);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("admin")) {
    throw new Error("Forbidden: admin role required");
  }
}

type GeminiCredConfig = {
  api_key?: string;
  tier?: string;
  model?: string;
  max_input_chars?: string | number;
};

export type GeminiAdminConfig = {
  api_key_hint: string; // masked — last 4 chars
  tier: "free" | "paid";
  model: GeminiModel;
  max_input_chars: number;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
};

// ── Read (masked) ──────────────────────────────────────────────────

export const getGeminiConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GeminiAdminConfig> => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    const { data, error } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active, last_tested_at, last_test_status, last_test_error")
      .eq("integration_key", INTEGRATION_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const row =
      (data as {
        config: GeminiCredConfig;
        is_active: boolean;
        last_tested_at: string | null;
        last_test_status: string | null;
        last_test_error: string | null;
      } | null) ?? null;

    const cfg = row?.config ?? {};
    const key = cfg.api_key ?? "";

    return {
      api_key_hint: key.length > 4 ? `••••${key.slice(-4)}` : key ? "••••" : "",
      tier: cfg.tier === "free" ? "free" : "paid",
      model: (GEMINI_MODEL_VALUES as readonly string[]).includes(cfg.model ?? "")
        ? (cfg.model as GeminiModel)
        : "gemini-2.5-flash",
      max_input_chars: Number(cfg.max_input_chars ?? 8000),
      is_active: row?.is_active ?? false,
      last_tested_at: row?.last_tested_at ?? null,
      last_test_status: row?.last_test_status ?? null,
      last_test_error: row?.last_test_error ?? null,
    };
  });

// ── Save (preserve key when blank) ─────────────────────────────────

const SaveSchema = z.object({
  api_key: z.string().max(256).optional(),
  tier: z.enum(["free", "paid"]),
  model: z.enum(GEMINI_MODEL_VALUES),
  max_input_chars: z.number().int().min(1000).max(32000),
  is_active: z.boolean(),
});

export const saveGeminiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    const { data: existing } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config")
      .eq("integration_key", INTEGRATION_KEY)
      .maybeSingle();

    const existingKey = (existing as { config?: GeminiCredConfig } | null)?.config?.api_key ?? "";
    const nextKey = data.api_key && data.api_key.trim() ? data.api_key.trim() : existingKey;

    const { error } = await supabaseAdmin.from("integration_credentials" as never).upsert({
      integration_key: INTEGRATION_KEY,
      display_name: "Google Gemini API",
      config: {
        api_key: nextKey,
        tier: data.tier,
        model: data.model,
        max_input_chars: String(data.max_input_chars),
      },
      is_active: data.is_active,
      updated_by: userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Test connection ────────────────────────────────────────────────

export const testGeminiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    const { data: existing } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config")
      .eq("integration_key", INTEGRATION_KEY)
      .maybeSingle();

    const cfg = (existing as { config?: GeminiCredConfig } | null)?.config ?? {};
    const apiKey = cfg.api_key ?? "";

    if (!apiKey) {
      return { ok: false as const, error: "No API key saved. Enter and save a key first." };
    }

    const result = await classifyWithGemini({
      ocrText: "Form W-2 Wage and Tax Statement. Wages, tips, other compensation.",
      filename: "connection-test.pdf",
      knownTypes: ["W2", "GST_INVOICE", "BANK_STMT"],
      model: (cfg.model as GeminiModel) ?? "gemini-2.5-flash",
      apiKey,
      tier: cfg.tier === "free" ? "free" : "paid",
    });

    const ok = !result.error_code;
    await supabaseAdmin
      .from("integration_credentials" as never)
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: ok ? "ok" : "failed",
        last_test_error: ok ? null : result.error_code,
      } as never)
      .eq("integration_key", INTEGRATION_KEY);

    return ok
      ? {
          ok: true as const,
          detected: result.doc_type,
          tokens: result.input_tokens + result.output_tokens,
        }
      : { ok: false as const, error: result.error_code ?? "Unknown error" };
  });
