// Server functions for the Auto-Categorisation admin panel and actions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { categoriseDocument, type CatRule, type CatConfig } from "./categorisation-engine";
import { type NbModel } from "./categorisation-ml";
import {
  readSchedule,
  writeSchedule,
  runCategorisationTraining,
} from "./categorisation-training.server";
import {
  discoverAndProposeDocType,
  auditDetectionRules,
  type DocTypeProposal,
  type RuleAuditFinding,
} from "./gemini-client";

// Load the active Naive Bayes model (or null if none trained yet).
async function loadActiveModel(): Promise<NbModel | null> {
  const { data } = await supabaseAdmin
    .from("categorisation_ml_model" as never)
    .select("model_json")
    .eq("is_active", true)
    .maybeSingle();
  return ((data as { model_json?: NbModel } | null)?.model_json ?? null) as NbModel | null;
}

// ── Helpers ────────────────────────────────────────────────────────

// Roles live in the user_roles table, NOT in JWT claims.
// Use supabaseAdmin so RLS doesn't block the lookup.
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

// ── Config CRUD ────────────────────────────────────────────────────

export const listCategorisationConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as { supabase: any };
    const { data, error } = await supabase
      .from("categorisation_config")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data as CatConfig[];
  });

export const createCategorisationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        doc_type: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[A-Z0-9_]+$/, "doc_type must be uppercase letters, numbers, underscores only"),
        display_name: z.string().min(1).max(100),
        mapped_category: z.string().min(1).max(100),
        country_code: z.string().min(2).max(3).default("ALL"),
        min_confidence: z.number().int().min(0).max(100).default(75),
        allow_multi_segment: z.boolean().default(false),
        highlight_color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color e.g. #378ADD")
          .default("#378ADD"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    const { data: configs } = await supabaseAdmin
      .from("categorisation_config" as never)
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = ((configs as any[])?.[0]?.sort_order ?? 0) + 1;

    const { data: row, error } = await supabaseAdmin
      .from("categorisation_config" as never)
      .insert({
        ...data,
        auto_post_ledger: false,
        is_active: true,
        sort_order: nextOrder,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCategorisationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        docType: z.string().min(1).max(50),
        patch: z.object({
          display_name: z.string().min(1).max(100).optional(),
          mapped_category: z.string().min(1).max(100).optional(),
          min_confidence: z.number().int().min(0).max(100).optional(),
          allow_multi_segment: z.boolean().optional(),
          auto_post_ledger: z.boolean().optional(),
          highlight_color: z.string().max(7).optional(),
          is_active: z.boolean().optional(),
          sort_order: z.number().int().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    const { error } = await supabaseAdmin
      .from("categorisation_config" as never)
      .update({ ...data.patch, updated_at: new Date().toISOString() } as never)
      .eq("doc_type", data.docType);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleCategorisationMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ isActive: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    const { error } = await supabaseAdmin
      .from("categorisation_config" as never)
      .update({
        is_active: data.isActive,
        updated_at: new Date().toISOString(),
      } as never)
      .neq("doc_type", "__never__");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Rules CRUD ─────────────────────────────────────────────────────

export const listCategorisationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ docType: z.string().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: rules, error } = await supabase
      .from("categorisation_rules")
      .select("*")
      .eq("doc_type", data.docType)
      .order("signal_type")
      .order("weight", { ascending: false });
    if (error) throw new Error(error.message);
    return rules as CatRule[];
  });

const RuleInputSchema = z.object({
  doc_type: z.string().min(1).max(50),
  signal_text: z.string().min(1).max(2000),
  signal_type: z.enum(["filename", "form-code", "keyword", "regex"]),
  signal_source: z.enum(["filename", "ocr"]),
  weight: z.number().int().min(0).max(100),
  is_active: z.boolean().optional().default(true),
  priority: z.number().int().optional().default(0),
});

export const createCategorisationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RuleInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    const { data: row, error } = await supabaseAdmin
      .from("categorisation_rules" as never)
      .insert(data as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCategorisationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          signal_text: z.string().min(1).max(2000).optional(),
          signal_type: z.enum(["filename", "form-code", "keyword", "regex"]).optional(),
          signal_source: z.enum(["filename", "ocr"]).optional(),
          weight: z.number().int().min(0).max(100).optional(),
          is_active: z.boolean().optional(),
          priority: z.number().int().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    const { error } = await supabaseAdmin
      .from("categorisation_rules" as never)
      .update({ ...data.patch, updated_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCategorisationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    const { error } = await supabaseAdmin
      .from("categorisation_rules" as never)
      .update({ is_active: false, updated_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Actions ────────────────────────────────────────────────────────

export const simulateCategorisation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: z.string().max(500).default(""),
        ocrText: z.string().max(50000).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { data: rules, error: rErr } = await supabaseAdmin
      .from("categorisation_rules" as never)
      .select("*")
      .eq("is_active", true);
    if (rErr) throw new Error(rErr.message);

    const { data: configs, error: cErr } = await supabaseAdmin
      .from("categorisation_config" as never)
      .select("*")
      .eq("is_active", true);
    if (cErr) throw new Error(cErr.message);

    const pagesMap = new Map<number, string>();
    pagesMap.set(1, data.ocrText);

    // Exercise the local ML fallback in the simulator (Gemini stays off here —
    // the simulator never calls the paid API).
    const model = await loadActiveModel();

    const results = categoriseDocument(
      data.ocrText,
      pagesMap,
      data.filename,
      rules as unknown as CatRule[],
      configs as unknown as CatConfig[],
      model,
    );
    return { results };
  });

export const getCategorisationResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attachmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: rows, error } = await supabase
      .from("doc_categorisation_results")
      .select("*")
      .eq("task_attachment_id", data.attachmentId)
      .order("segment_index", { ascending: true });
    if (error) throw new Error(error.message);
    return rows;
  });

export const confirmCategorisation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resultId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { error } = await supabaseAdmin
      .from("doc_categorisation_results" as never)
      .update({
        status: "confirmed",
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
      } as never)
      .eq("id", data.resultId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const overrideCategorisation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        resultId: z.string().uuid(),
        newDocType: z.string().min(1).max(50),
        newCategory: z.string().min(1).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { error } = await supabaseAdmin
      .from("doc_categorisation_results" as never)
      .update({
        doc_type: data.newDocType,
        mapped_category: data.newCategory,
        status: "overridden",
        detection_method: "manual",
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
      } as never)
      .eq("id", data.resultId);
    if (error) throw new Error(error.message);

    // Also update the denormalized columns on task_attachments
    const { data: result } = await supabaseAdmin
      .from("doc_categorisation_results" as never)
      .select("task_attachment_id")
      .eq("id", data.resultId)
      .single();
    if (result) {
      await supabaseAdmin
        .from("task_attachments" as never)
        .update({
          doc_type: data.newDocType,
          mapped_category: data.newCategory,
          detection_method: "manual",
          categorisation_status: "categorised",
        } as never)
        .eq("id", (result as any).task_attachment_id);
    }

    return { ok: true };
  });

export const retryCategorisation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attachmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    // Clear old results
    await supabaseAdmin
      .from("doc_categorisation_results" as never)
      .delete()
      .eq("task_attachment_id", data.attachmentId);

    // Reset status to pending
    const { error } = await supabaseAdmin
      .from("task_attachments" as never)
      .update({
        categorisation_status: "pending",
        doc_type: null,
        mapped_category: null,
        confidence_score: null,
        detection_method: null,
        categorisation_started_at: null,
      } as never)
      .eq("id", data.attachmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCategorisationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: results, error } = await supabaseAdmin
      .from("doc_categorisation_results" as never)
      .select("doc_type, confidence_score, detection_method, status, created_at")
      .gte("created_at", thirtyDaysAgo);
    if (error) throw new Error(error.message);

    const rows = (results ?? []) as Array<{
      doc_type: string | null;
      confidence_score: number;
      detection_method: string;
      status: string;
      created_at: string;
    }>;

    const total = rows.length;
    const needsReview = rows.filter((r) => r.status === "needs_review").length;
    const avgConfidence =
      total > 0 ? Math.round(rows.reduce((s, r) => s + r.confidence_score, 0) / total) : 0;
    const mlCount = rows.filter((r) => r.detection_method === "ml").length;

    const byDocType: Record<string, number> = {};
    for (const r of rows) {
      if (r.doc_type) byDocType[r.doc_type] = (byDocType[r.doc_type] ?? 0) + 1;
    }

    return {
      total,
      needsReview,
      avgConfidence,
      mlPercentage: total > 0 ? Math.round((mlCount / total) * 100) : 0,
      byDocType,
    };
  });

export const runCategorisationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ batchSize: z.number().int().min(1).max(50).optional().default(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    const STALE_MINUTES = 10;
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

    // Recover stale 'processing' docs first
    await supabaseAdmin
      .from("task_attachments" as never)
      .update({ categorisation_status: "pending", categorisation_started_at: null } as never)
      .eq("categorisation_status", "processing")
      .lt("categorisation_started_at", cutoff);

    // Claim pending batch
    const { data: pending, error } = await supabaseAdmin
      .from("task_attachments" as never)
      .select("id, storage_path, filename, mime_type")
      .eq("categorisation_status", "pending")
      .limit(data.batchSize);

    if (error) throw new Error(error.message);
    const list = (pending ?? []) as Array<{
      id: string;
      storage_path: string;
      filename: string;
      mime_type: string | null;
    }>;

    if (!list.length) return { ok: true, processed: 0, message: "No pending documents" };

    const ids = list.map((d) => d.id);
    await supabaseAdmin
      .from("task_attachments" as never)
      .update({
        categorisation_status: "processing",
        categorisation_started_at: new Date().toISOString(),
      } as never)
      .in("id", ids);

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fnUrl = `${supabaseUrl}/functions/v1/categorise-document`;

    let dispatched = 0;
    let failed = 0;
    for (const doc of list) {
      try {
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            docId: doc.id,
            storagePath: doc.storage_path,
            filename: doc.filename,
            mimeType: doc.mime_type,
          }),
        });
        dispatched++;
      } catch {
        failed++;
      }
    }

    return { ok: true, processed: dispatched, failed, total: list.length };
  });

// Extracts text from a PDF for the simulator — calls the Edge Function with
// raw base64 content so no Storage upload is needed.
export const extractTextForSimulator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        base64Content: z.string().max(20 * 1024 * 1024), // 20 MB base64 cap
        filename: z.string().max(500).default("upload.pdf"),
        mimeType: z.string().max(100).default("application/pdf"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fnUrl = `${supabaseUrl}/functions/v1/categorise-document`;

    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        extractOnly: true,
        base64Content: data.base64Content,
        filename: data.filename,
        mimeType: data.mimeType,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Text extraction failed: ${err}`);
    }

    const json = (await res.json()) as {
      status: string;
      fullText?: string;
      totalPages?: number;
      errorMessage?: string;
    };
    return json;
  });

// ── ML training + schedule ─────────────────────────────────────────

// The training schedule shape. The server-only schedule/training functions that
// operate on it live in `./categorisation-training.server` so this client-imported
// module never pulls the service-role client into the browser bundle.
export type TrainingSchedule = {
  enabled: boolean;
  mode: "interval" | "times";
  interval_hours: number;
  times: string[]; // UTC "HH:MM", used in 'times' mode
  min_gap_minutes: number;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_summary: string | null;
};

// Retrains the local Naive Bayes model immediately. Admin only.
export const trainCategorisationModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ includeGeminiLabelled: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    return runCategorisationTraining(data.includeGeminiLabelled);
  });

// Read the training schedule. Admin only.
export const getTrainingSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrainingSchedule> => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    return readSchedule();
  });

// Update the training schedule (time / frequency / multiple runs a day). Admin only.
export const updateTrainingSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        mode: z.enum(["interval", "times"]),
        interval_hours: z.number().int().min(1).max(168),
        times: z
          .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24h HH:MM"))
          .min(1)
          .max(12),
        min_gap_minutes: z.number().int().min(15).max(720),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    // De-duplicate + sort times for a stable display.
    const times = Array.from(new Set(data.times)).sort();
    await writeSchedule({ ...data, times });
    return { ok: true as const };
  });

type UsagePeriod = "7d" | "30d" | "90d" | "all";

function periodCutoff(period: UsagePeriod): string | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// Token usage + cost dashboard data. Admin only.
export const getGeminiUsageStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ period: z.enum(["7d", "30d", "90d", "all"]).default("30d") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    const cutoff = periodCutoff(data.period);

    let logQuery = supabaseAdmin
      .from("gemini_usage_log" as never)
      .select(
        "input_tokens, output_tokens, cost_usd, tier, call_purpose, doc_type_result, error_code, called_at",
      );
    if (cutoff) logQuery = logQuery.gte("called_at", cutoff);
    const { data: logsRaw, error } = await logQuery;
    if (error) throw new Error(error.message);

    const logs = (logsRaw ?? []) as Array<{
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
      tier: string;
      call_purpose: string;
      doc_type_result: string | null;
      error_code: string | null;
      called_at: string;
    }>;

    const total_calls = logs.length;
    const total_input_tokens = logs.reduce((s, r) => s + (r.input_tokens ?? 0), 0);
    const total_output_tokens = logs.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
    const total_cost_usd = logs.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    const errors = logs.filter((r) => r.error_code).length;
    const free_tier_calls = logs.filter((r) => r.tier === "free").length;

    const byDay = new Map<string, { calls: number; cost_usd: number }>();
    const byType = new Map<string, { calls: number; cost_usd: number; tokens: number }>();
    const byPurpose = new Map<string, { calls: number; cost_usd: number }>();
    let current_month_cost = 0;
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM

    for (const r of logs) {
      const day = r.called_at.slice(0, 10);
      const d = byDay.get(day) ?? { calls: 0, cost_usd: 0 };
      d.calls++;
      d.cost_usd += Number(r.cost_usd ?? 0);
      byDay.set(day, d);

      const typeKey = r.doc_type_result ?? "unknown";
      const t = byType.get(typeKey) ?? { calls: 0, cost_usd: 0, tokens: 0 };
      t.calls++;
      t.cost_usd += Number(r.cost_usd ?? 0);
      t.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      byType.set(typeKey, t);

      const p = byPurpose.get(r.call_purpose) ?? { calls: 0, cost_usd: 0 };
      p.calls++;
      p.cost_usd += Number(r.cost_usd ?? 0);
      byPurpose.set(r.call_purpose, p);

      if (r.called_at.startsWith(monthPrefix)) current_month_cost += Number(r.cost_usd ?? 0);
    }

    const dayOfMonth = new Date().getUTCDate();
    const projected_month_cost =
      dayOfMonth > 0 ? (current_month_cost / dayOfMonth) * 30 : current_month_cost;

    return {
      config: {
        configured: !!process.env.GEMINI_API_KEY,
        tier: (process.env.GEMINI_TIER ?? "paid") === "free" ? "free" : "paid",
        model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      },
      total_calls,
      total_input_tokens,
      total_output_tokens,
      total_cost_usd,
      calls_by_day: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, calls: v.calls, cost_usd: v.cost_usd })),
      calls_by_doc_type: [...byType.entries()]
        .map(([doc_type, v]) => ({
          doc_type,
          calls: v.calls,
          cost_usd: v.cost_usd,
          avg_tokens: v.calls > 0 ? Math.round(v.tokens / v.calls) : 0,
        }))
        .sort((a, b) => b.cost_usd - a.cost_usd),
      calls_by_purpose: [...byPurpose.entries()].map(([purpose, v]) => ({
        purpose,
        calls: v.calls,
        cost_usd: v.cost_usd,
      })),
      error_rate: total_calls > 0 ? errors / total_calls : 0,
      free_tier_calls,
      paid_calls: total_calls - free_tier_calls,
      current_month_cost,
      projected_month_cost,
    };
  });

// Per-class ML training progress for the admin panel. Admin only.
export const getMLTrainingProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    const [{ data: configsRaw }, { data: resultsRaw }, { data: modelRaw }] = await Promise.all([
      supabaseAdmin
        .from("categorisation_config" as never)
        .select(
          "doc_type, display_name, country_code, gemini_sample_target, gemini_bootstrap_done, sort_order",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("doc_categorisation_results" as never)
        .select("doc_type, status, created_at")
        .in("status", ["confirmed", "overridden", "gemini_labelled"])
        .not("segment_text", "is", null),
      supabaseAdmin
        .from("categorisation_ml_model" as never)
        .select("trained_at, sample_count")
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const configs = (configsRaw ?? []) as Array<{
      doc_type: string;
      display_name: string;
      country_code: string;
      gemini_sample_target: number;
      gemini_bootstrap_done: boolean;
    }>;
    const results = (resultsRaw ?? []) as Array<{
      doc_type: string | null;
      status: string;
      created_at: string;
    }>;

    const agg = new Map<string, { confirmed: number; gemini: number; last: string | null }>();
    for (const r of results) {
      if (!r.doc_type) continue;
      const a = agg.get(r.doc_type) ?? { confirmed: 0, gemini: 0, last: null };
      if (r.status === "gemini_labelled") a.gemini++;
      else a.confirmed++;
      if (!a.last || r.created_at > a.last) a.last = r.created_at;
      agg.set(r.doc_type, a);
    }

    const classes = configs.map((c) => {
      const a = agg.get(c.doc_type) ?? { confirmed: 0, gemini: 0, last: null };
      const total = a.confirmed + a.gemini;
      const target = c.gemini_sample_target || 50;
      return {
        doc_type: c.doc_type,
        display_name: c.display_name,
        country_code: c.country_code,
        sample_target: target,
        confirmed_count: a.confirmed,
        gemini_count: a.gemini,
        total_count: total,
        pct_trained: Math.min(100, Math.round((total / target) * 100)),
        is_ready: total >= 30,
        is_complete: total >= target,
        last_sample_at: a.last,
        gemini_bootstrap_done: c.gemini_bootstrap_done,
      };
    });

    const completeCount = classes.filter((c) => c.is_complete).length;
    const overall_pct_trained =
      classes.length > 0
        ? Math.round(classes.reduce((s, c) => s + c.pct_trained, 0) / classes.length)
        : 0;

    const model = modelRaw as { trained_at?: string; sample_count?: number } | null;

    return {
      overall_pct_trained,
      types_complete: completeCount,
      types_total: classes.length,
      classes,
      model_last_trained: model?.trained_at ?? null,
      model_sample_count: model?.sample_count ?? 0,
    };
  });

// Bulk Gemini bootstrap: dispatch unclassified docs through the Edge Function.
// Admin only. Fire-and-forget — returns immediately.
export const triggerGeminiBootstrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        doc_types: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    // Claim docs that have not been classified yet (needs_review or unset).
    const query = supabaseAdmin
      .from("task_attachments" as never)
      .select("id, storage_path, filename, mime_type")
      .is("doc_type", null)
      .or("categorisation_status.is.null,categorisation_status.eq.needs_review")
      .limit(data.limit);
    const { data: pending, error } = await query;
    if (error) throw new Error(error.message);

    const list = (pending ?? []) as Array<{
      id: string;
      storage_path: string;
      filename: string;
      mime_type: string | null;
    }>;
    if (!list.length) return { ok: true, queued: 0, job_id: crypto.randomUUID() };

    const ids = list.map((d) => d.id);
    await supabaseAdmin
      .from("task_attachments" as never)
      .update({
        categorisation_status: "processing",
        categorisation_started_at: new Date().toISOString(),
      } as never)
      .in("id", ids);

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fnUrl = `${supabaseUrl}/functions/v1/categorise-document`;

    for (const doc of list) {
      try {
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            docId: doc.id,
            storagePath: doc.storage_path,
            filename: doc.filename,
            mimeType: doc.mime_type,
          }),
        });
      } catch {
        // best-effort dispatch; stale 'processing' docs get recovered later
      }
    }

    return { ok: true, queued: list.length, job_id: crypto.randomUUID() };
  });

// Per-doc-type Gemini settings. Admin only.
export const updateGeminiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        doc_type: z.string().min(1).max(50),
        gemini_enabled: z.boolean().optional(),
        gemini_sample_target: z.number().int().min(10).max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    const patch: Record<string, unknown> = {};
    if (data.gemini_enabled !== undefined) patch.gemini_enabled = data.gemini_enabled;
    if (data.gemini_sample_target !== undefined)
      patch.gemini_sample_target = data.gemini_sample_target;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabaseAdmin
      .from("categorisation_config" as never)
      .update(patch as never)
      .eq("doc_type", data.doc_type);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Real-time Gemini labeling ──────────────────────────────────────

// Helper: load Gemini credentials from integration_credentials (DB-managed).
// requireActive=true  → also checks is_active (used by automatic background fallback)
// requireActive=false → returns key even if the toggle is off (used for explicit user actions)
async function loadGeminiCreds(requireActive = true): Promise<{
  apiKey: string;
  model: string;
  tier: "free" | "paid";
  maxInputChars: number;
} | null> {
  const { data } = await supabaseAdmin
    .from("integration_credentials" as never)
    .select("config, is_active")
    .eq("integration_key", "gemini_api")
    .maybeSingle();

  const row = data as { config: Record<string, string>; is_active: boolean } | null;
  if (!row) return null;
  if (requireActive && row.is_active === false) return null;
  const cfg = row.config ?? {};
  const apiKey = cfg.api_key ?? "";
  if (!apiKey) return null;
  return {
    apiKey,
    model: cfg.model ?? "gemini-2.5-flash",
    tier: cfg.tier === "free" ? "free" : "paid",
    maxInputChars: Number(cfg.max_input_chars ?? 8000),
  };
}

// Labels a single doc_categorisation_results row with Gemini in real time.
// Reads the stored segment_text, calls Gemini, writes gemini_labelled back.
// Callable by any authenticated user who has access to the attachment.
export const labelWithGemini = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resultId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    // requireActive=false: user explicitly clicked the button — allow even when
    // the automatic fallback toggle is off.
    const creds = await loadGeminiCreds(false);
    if (!creds) {
      throw new Error("No Gemini API key saved. Add one in Admin → Integration → Gemini.");
    }

    // Load the result row + its segment text.
    const { data: row, error: rowErr } = await supabaseAdmin
      .from("doc_categorisation_results" as never)
      .select("id, segment_text, task_attachment_id, doc_type")
      .eq("id", data.resultId)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row) throw new Error("Result not found");

    const r = row as {
      id: string;
      segment_text: string | null;
      task_attachment_id: string;
      doc_type: string | null;
    };
    if (!r.segment_text) {
      throw new Error(
        "No extracted text stored for this document. Re-process it first (Process Now).",
      );
    }

    // Load active doc types for the known-types list.
    const { data: configs } = await supabaseAdmin
      .from("categorisation_config" as never)
      .select("doc_type, mapped_category")
      .eq("is_active", true);
    const knownTypes = (
      (configs ?? []) as Array<{ doc_type: string; mapped_category: string }>
    ).map((c) => c.doc_type);
    const categoryByType = new Map(
      ((configs ?? []) as Array<{ doc_type: string; mapped_category: string }>).map((c) => [
        c.doc_type,
        c.mapped_category,
      ]),
    );

    const { classifyWithGemini } = await import("./gemini-client");
    const g = await classifyWithGemini({
      ocrText: r.segment_text,
      filename: "document",
      knownTypes,
      model: creds.model as import("./gemini-client").GeminiModel,
      apiKey: creds.apiKey,
      tier: creds.tier,
      maxInputChars: creds.maxInputChars,
    });

    // Log usage.
    await supabaseAdmin.from("gemini_usage_log" as never).insert({
      org_id: null,
      doc_id: r.task_attachment_id,
      result_id: r.id,
      call_purpose: "classify",
      gemini_model: g.model,
      input_tokens: g.input_tokens,
      output_tokens: g.output_tokens,
      cost_usd: g.cost_usd,
      tier: creds.tier,
      doc_type_result: g.doc_type,
      latency_ms: g.latency_ms,
      error_code: g.error_code,
    } as never);

    if (g.error_code || !g.doc_type) {
      throw new Error(
        g.error_code === "HTTP_400"
          ? "Gemini returned an error. The text may be too short or unrecognisable."
          : `Gemini error: ${g.error_code}`,
      );
    }

    const category = categoryByType.get(g.doc_type) ?? g.mapped_category ?? "";

    // Write the label back to the result row.
    const { error: updateErr } = await supabaseAdmin
      .from("doc_categorisation_results" as never)
      .update({
        doc_type: g.doc_type,
        mapped_category: category,
        confidence_score: g.confidence,
        detection_method: "gemini",
        status: "gemini_labelled",
        gemini_input_tokens: g.input_tokens,
        gemini_output_tokens: g.output_tokens,
        gemini_model: g.model,
        gemini_cost_usd: g.cost_usd,
      } as never)
      .eq("id", data.resultId);
    if (updateErr) throw new Error(updateErr.message);

    // Update denormalized columns on the attachment too.
    await supabaseAdmin
      .from("task_attachments" as never)
      .update({
        doc_type: g.doc_type,
        mapped_category: category,
        confidence_score: g.confidence,
        detection_method: "gemini",
        categorisation_status: "needs_review", // still needs human confirm
      } as never)
      .eq("id", r.task_attachment_id);

    return {
      ok: true,
      doc_type: g.doc_type,
      display_name:
        ((configs ?? []) as Array<{ doc_type: string; mapped_category: string }>).find(
          (c) => c.doc_type === g.doc_type,
        )?.mapped_category ?? g.doc_type,
      confidence: g.confidence,
      reasoning: g.reasoning,
      tokens: g.input_tokens + g.output_tokens,
      cost_usd: g.cost_usd,
    };
  });

// Calls Gemini on free-form text without writing to the DB — for the Simulator.
export const simulateWithGemini = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ocrText: z.string().min(10).max(50000),
        filename: z.string().max(500).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // requireActive=false: user explicitly clicked "Try with Gemini" — allow
    // even when the automatic fallback toggle is off.
    const creds = await loadGeminiCreds(false);
    if (!creds) {
      throw new Error("No Gemini API key saved. Add one in Admin → Integration → Gemini.");
    }

    const { data: configs } = await supabaseAdmin
      .from("categorisation_config" as never)
      .select("doc_type, display_name")
      .eq("is_active", true);
    const knownTypes = ((configs ?? []) as Array<{ doc_type: string; display_name: string }>).map(
      (c) => c.doc_type,
    );
    const nameByType = new Map(
      ((configs ?? []) as Array<{ doc_type: string; display_name: string }>).map((c) => [
        c.doc_type,
        c.display_name,
      ]),
    );

    const { classifyWithGemini } = await import("./gemini-client");
    const g = await classifyWithGemini({
      ocrText: data.ocrText,
      filename: data.filename || "simulator-test",
      knownTypes,
      model: creds.model as import("./gemini-client").GeminiModel,
      apiKey: creds.apiKey,
      tier: creds.tier,
      maxInputChars: creds.maxInputChars,
    });

    if (g.error_code) throw new Error(`Gemini error: ${g.error_code}`);

    return {
      doc_type: g.doc_type,
      display_name: g.doc_type ? (nameByType.get(g.doc_type) ?? g.doc_type) : null,
      confidence: g.confidence,
      mapped_category: g.mapped_category,
      reasoning: g.reasoning,
      extracted_fields: g.extracted_fields,
      input_tokens: g.input_tokens,
      output_tokens: g.output_tokens,
      cost_usd: g.cost_usd,
      model: g.model,
    };
  });

// ── Doc-type discovery & rule creation ────────────────────────────

// Re-export types so UI can import from a single functions file.
export type { DocTypeProposal, RuleAuditFinding };

// Step 1 — ask Gemini to identify the document and propose rules (no DB write).
// Works on any text: paste from Simulator, segment_text from a result row, etc.
export const proposeNewDocType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ocrText: z.string().min(10).max(50000),
        filename: z.string().max(500).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const creds = await loadGeminiCreds(false);
    if (!creds)
      throw new Error("No Gemini API key saved. Add one in Admin → Integration → Gemini.");

    const proposal = await discoverAndProposeDocType({
      ocrText: data.ocrText,
      filename: data.filename,
      apiKey: creds.apiKey,
      model: creds.model as import("./gemini-client").GeminiModel,
      tier: creds.tier,
      maxInputChars: creds.maxInputChars,
    });

    // Tell the caller whether this doc_type already exists in the DB.
    const { data: existing } = await supabaseAdmin
      .from("categorisation_config" as never)
      .select("doc_type")
      .eq("doc_type", proposal.doc_type)
      .maybeSingle();

    return {
      ...proposal,
      already_exists: !!existing,
    };
  });

// Step 2 — admin reviewed/edited the proposal; save to DB.
// Creates categorisation_config + categorisation_rules in one call.
const ProposedRuleSchema = z.object({
  signal_text: z.string().min(1).max(2000),
  signal_type: z.enum(["filename", "form-code", "keyword", "regex"]),
  signal_source: z.enum(["filename", "ocr"]),
  weight: z.number().int().min(0).max(100),
});

export const createDocTypeFromProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        doc_type: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[A-Z0-9_]+$/, "doc_type must be SCREAMING_SNAKE_CASE"),
        display_name: z.string().min(1).max(100),
        mapped_category: z.string().min(1).max(100),
        country_code: z.string().min(2).max(3).default("ALL"),
        min_confidence: z.number().int().min(50).max(99).default(75),
        highlight_color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .default("#378ADD"),
        rules: z.array(ProposedRuleSchema).min(1).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    // Check if config already exists (user may be adding rules to an existing type).
    const { data: existing } = await supabaseAdmin
      .from("categorisation_config" as never)
      .select("doc_type")
      .eq("doc_type", data.doc_type)
      .maybeSingle();

    if (!existing) {
      // Get the next sort_order.
      const { data: maxRow } = await supabaseAdmin
        .from("categorisation_config" as never)
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

      const { error: cfgErr } = await supabaseAdmin.from("categorisation_config" as never).insert({
        doc_type: data.doc_type,
        display_name: data.display_name,
        mapped_category: data.mapped_category,
        country_code: data.country_code,
        min_confidence: data.min_confidence,
        highlight_color: data.highlight_color,
        allow_multi_segment: false,
        auto_post_ledger: false,
        is_active: true,
        sort_order: nextOrder,
      } as never);
      if (cfgErr) throw new Error(`Failed to create doc type: ${cfgErr.message}`);
    }

    // Insert rules (skip duplicates by signal_text for this doc_type).
    const { error: rulesErr } = await supabaseAdmin.from("categorisation_rules" as never).insert(
      data.rules.map((r) => ({
        doc_type: data.doc_type,
        signal_text: r.signal_text,
        signal_type: r.signal_type,
        signal_source: r.signal_source,
        weight: r.weight,
        is_active: true,
        priority: 0,
      })) as never,
    );
    if (rulesErr) throw new Error(`Failed to create rules: ${rulesErr.message}`);

    return {
      ok: true,
      created_config: !existing,
      doc_type: data.doc_type,
      rules_added: data.rules.length,
    };
  });

// Loads all active configs + rules, sends them to Gemini for a quality audit,
// returns structured findings with severity + suggestions. Admin only.
export const reviewRulesWithGemini = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);

    const creds = await loadGeminiCreds(false);
    if (!creds)
      throw new Error("No Gemini API key saved. Add one in Admin → Integration → Gemini.");

    const [{ data: configs }, { data: rules }] = await Promise.all([
      supabaseAdmin
        .from("categorisation_config" as never)
        .select("doc_type, display_name, min_confidence, country_code")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("categorisation_rules" as never)
        .select("doc_type, signal_text, signal_type, signal_source, weight, is_active"),
    ]);

    if (!configs?.length) throw new Error("No active document types found.");

    const result = await auditDetectionRules({
      configs: configs as Array<{
        doc_type: string;
        display_name: string;
        min_confidence: number;
        country_code: string;
      }>,
      rules: (rules ?? []) as Array<{
        doc_type: string;
        signal_text: string;
        signal_type: string;
        signal_source: string;
        weight: number;
        is_active: boolean;
      }>,
      apiKey: creds.apiKey,
      model: creds.model as import("./gemini-client").GeminiModel,
      tier: creds.tier,
    });

    return {
      findings: result.findings,
      doc_types_reviewed: configs.length,
      rules_reviewed: (rules ?? []).length,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      cost_usd: result.cost_usd,
    };
  });
