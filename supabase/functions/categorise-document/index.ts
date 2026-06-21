// Supabase Edge Function: categorise-document
// Downloads a file from storage, extracts text, runs the 4-layer scoring
// pipeline, and writes results to doc_categorisation_results + task_attachments.
import { createClient } from "npm:@supabase/supabase-js@2";
import { downloadFile } from "./file-downloader.ts";
import { extractPdfText } from "./text-extractor.ts";
import { categoriseDocument, type CatRule, type CatConfig } from "./categorisation-engine.ts";
import type { NbModel } from "./categorisation-ml.ts";
import { classifyWithGemini, type GeminiModel } from "./gemini-client.ts";

const MAX_SEGMENT_TEXT = 8000; // chars retained per segment for ML training

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Custom auth: this function is invoked server-to-server with the service-role
  // key as a bearer token (verify_jwt is disabled). Reject anything else.
  const authHeader = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!authHeader.includes(serviceKey)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const { docId, storagePath, filename, mimeType, extractOnly, base64Content } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // ── Extract-only mode: used by the Simulator (no Storage upload) ──
    if (extractOnly) {
      if (!base64Content) {
        return jsonResponse({ error: "base64Content required for extractOnly mode" }, 400);
      }
      const binaryStr = atob(base64Content);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const extractionOnly = await extractPdfText(bytes, mimeType ?? "application/pdf");
      return jsonResponse({
        status: extractionOnly.status,
        fullText: extractionOnly.fullText,
        totalPages: extractionOnly.totalPages,
        errorMessage: extractionOnly.errorMessage,
      });
    }

    // ── Normal categorisation mode ──────────────────────────────────
    if (!docId || !storagePath) {
      return jsonResponse({ error: "docId and storagePath required" }, 400);
    }

    // 1. Download file
    const fileBytes = await downloadFile(storagePath, supabase);

    // 2. Compute SHA-256 hash for duplicate detection
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileBytes);
    const fileHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 3. Check for duplicates (same hash in the same task's project)
    const { data: thisDoc } = await supabase
      .from("task_attachments")
      .select("task_id")
      .eq("id", docId)
      .single();

    if (thisDoc?.task_id) {
      const { data: dupes } = await supabase.rpc("check_attachment_hash_duplicate" as never, {
        p_hash: fileHash,
        p_task_id: thisDoc.task_id,
        p_exclude_id: docId,
      });

      // If the RPC doesn't exist yet, fall back to a simpler check.
      // For now, just skip duplicate detection silently.
      // TODO: create the RPC or do a direct query once schema supports file_hash column.
    }

    // 4. Extract text
    const extraction = await extractPdfText(fileBytes, mimeType ?? "application/pdf");

    if (extraction.status === "scan_deferred") {
      await supabase
        .from("task_attachments")
        .update({
          categorisation_status: "needs_review",
          doc_type: null,
          detection_method: "scan_deferred",
          categorisation_started_at: null,
        })
        .eq("id", docId);

      await supabase.from("doc_categorisation_results").insert({
        task_attachment_id: docId,
        segment_index: 0,
        doc_type: null,
        confidence_score: 0,
        detection_method: "scan_deferred",
        status: "needs_review",
        signals_matched: "[]",
      });

      return jsonResponse({ ok: true, status: "scan_deferred" });
    }

    if (extraction.status === "failed") {
      await supabase
        .from("task_attachments")
        .update({
          categorisation_status: "ocr_failed",
          doc_type: null,
          categorisation_started_at: null,
        })
        .eq("id", docId);

      return jsonResponse({ ok: false, error: extraction.errorMessage });
    }

    // 5. Load rules + configs + active ML model
    const [rulesRes, configsRes, modelRes] = await Promise.all([
      supabase.from("categorisation_rules").select("*").eq("is_active", true),
      supabase.from("categorisation_config").select("*").eq("is_active", true),
      supabase
        .from("categorisation_ml_model")
        .select("model_json")
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const rules = (rulesRes.data ?? []) as CatRule[];
    const configs = (configsRes.data ?? []) as CatConfig[];
    const model = (modelRes.data?.model_json ?? null) as NbModel | null;
    // Per-doc-type Gemini opt-out lives on categorisation_config.gemini_enabled.
    const geminiEnabledByType = new Map<string, boolean>(
      (configsRes.data ?? []).map((c: Record<string, unknown>) => [
        c.doc_type as string,
        c.gemini_enabled !== false,
      ]),
    );
    const categoryByType = new Map<string, string>(
      (configsRes.data ?? []).map((c: Record<string, unknown>) => [
        c.doc_type as string,
        c.mapped_category as string,
      ]),
    );

    // 6. Run categorisation (Layer 4 local ML runs inside when rules are cold)
    let results = categoriseDocument(
      extraction.fullText,
      extraction.pagesTextMap,
      filename ?? "unknown.pdf",
      rules,
      configs,
      model,
    );

    // 7. Clear old results and write new ones (with retained segment text).
    await supabase.from("doc_categorisation_results").delete().eq("task_attachment_id", docId);

    let insertedRows: Array<{ id: string; segment_index: number }> = [];
    if (results.length > 0) {
      const { data: inserted } = await supabase
        .from("doc_categorisation_results")
        .insert(
          results.map((r) => ({
            task_attachment_id: docId,
            segment_index: r.segment_index,
            segment_pages: r.segment_pages,
            doc_type: r.doc_type,
            mapped_category: r.mapped_category,
            confidence_score: r.confidence_score,
            detection_method: r.detection_method,
            signals_matched: r.signals_matched,
            runner_up_type: r.runner_up_type,
            runner_up_score: r.runner_up_score,
            status: r.status,
            segment_text: r.segment_text.slice(0, MAX_SEGMENT_TEXT),
          })),
        )
        .select("id, segment_index");
      insertedRows = (inserted ?? []) as Array<{ id: string; segment_index: number }>;
    }

    // 7b. Gemini fallback — for segments the rules + local ML left for review,
    // ask Gemini to classify and store the answer as labeled training data.
    results = await runGeminiFallback({
      supabase,
      docId,
      filename: filename ?? "unknown.pdf",
      results,
      insertedRows,
      configs,
      geminiEnabledByType,
      categoryByType,
    });

    // 8. Update denormalized columns on task_attachments
    const top = results[0];
    const isMulti = results.length > 1;
    const hasNeedsReview = results.some((r) => r.status === "needs_review");

    await supabase
      .from("task_attachments")
      .update({
        categorisation_status: hasNeedsReview ? "needs_review" : "categorised",
        doc_type: isMulti ? "MULTI" : (top?.doc_type ?? null),
        mapped_category: isMulti
          ? `Multiple — ${results.length} segments`
          : (top?.mapped_category ?? null),
        confidence_score: top?.confidence_score ?? null,
        detection_method: top?.detection_method ?? null,
        categorisation_started_at: null,
      })
      .eq("id", docId);

    return jsonResponse({
      ok: true,
      status: hasNeedsReview ? "needs_review" : "categorised",
      segments: results.length,
      topDocType: top?.doc_type,
      topConfidence: top?.confidence_score,
    });
  } catch (err) {
    console.error("categorise-document error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// Gemini bootstrap fallback: classify segments the rules + local ML could not
// resolve, store the answer as labeled training data, and log token usage/cost.
// Never throws — a Gemini failure leaves the segment in needs_review.
async function runGeminiFallback(args: {
  supabase: ReturnType<typeof createClient>;
  docId: string;
  filename: string;
  results: ReturnType<typeof categoriseDocument>;
  insertedRows: Array<{ id: string; segment_index: number }>;
  configs: CatConfig[];
  geminiEnabledByType: Map<string, boolean>;
  categoryByType: Map<string, string>;
}): Promise<ReturnType<typeof categoriseDocument>> {
  // Gemini credentials live in integration_credentials (key "gemini_api"),
  // managed from /admin/integration. Fall back to env vars for backward compat.
  const { data: credRow } = await args.supabase
    .from("integration_credentials")
    .select("config, is_active")
    .eq("integration_key", "gemini_api")
    .maybeSingle();

  const cred = (credRow ?? null) as { config: Record<string, string>; is_active: boolean } | null;
  // If a credentials row exists but is disabled, honor the off switch.
  if (cred && cred.is_active === false) return args.results;

  const cfg = cred?.config ?? {};
  const apiKey = cfg.api_key || Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return args.results; // Gemini not configured — leave as-is.

  const tier = (cfg.tier ?? Deno.env.get("GEMINI_TIER") ?? "paid") === "free" ? "free" : "paid";
  const geminiModel = (cfg.model ??
    Deno.env.get("GEMINI_MODEL") ??
    "gemini-2.5-flash") as GeminiModel;
  const maxInputChars = Number(
    cfg.max_input_chars ?? Deno.env.get("GEMINI_MAX_INPUT_CHARS") ?? "8000",
  );
  const knownTypes = args.configs.map((c) => c.doc_type);
  const idBySegment = new Map(args.insertedRows.map((r) => [r.segment_index, r.id]));

  const updated = [...args.results];

  for (let i = 0; i < updated.length; i++) {
    const seg = updated[i];
    if (seg.status !== "needs_review") continue;

    // Per-type opt-out: if the rules already guessed a type whose Gemini is
    // disabled, skip the call (keeps that type out of Gemini entirely).
    if (seg.doc_type && args.geminiEnabledByType.get(seg.doc_type) === false) continue;

    const resultId = idBySegment.get(seg.segment_index) ?? null;

    const g = await classifyWithGemini({
      ocrText: seg.segment_text,
      filename: args.filename,
      knownTypes,
      model: geminiModel,
      apiKey,
      tier,
      maxInputChars,
    });

    // Log every call (success or failure). No document text / fields stored.
    await args.supabase.from("gemini_usage_log").insert({
      org_id: null, // TODO: derive firm via attachment→task→project→firm
      doc_id: args.docId,
      result_id: resultId,
      call_purpose: "classify",
      gemini_model: g.model,
      input_tokens: g.input_tokens,
      output_tokens: g.output_tokens,
      cost_usd: g.cost_usd,
      tier,
      doc_type_result: g.doc_type,
      latency_ms: g.latency_ms,
      error_code: g.error_code,
    });

    await args.supabase.rpc("rpc_update_gemini_daily_rollup", {
      p_org_id: null,
      p_model: g.model,
      p_tier: tier,
      p_calls: 1,
      p_input_tokens: g.input_tokens,
      p_output_tokens: g.output_tokens,
      p_cost: g.cost_usd,
      p_errors: g.error_code ? 1 : 0,
    });

    if (g.error_code || !g.doc_type) continue; // leave segment in needs_review

    const category = args.categoryByType.get(g.doc_type) ?? g.mapped_category ?? null;

    // Persist Gemini's label as training data. Stays surfaced for admin review
    // (status gemini_labelled) but carries a usable doc_type suggestion.
    if (resultId) {
      await args.supabase
        .from("doc_categorisation_results")
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
        })
        .eq("id", resultId);
    }

    // Reflect the suggestion in the denormalized columns written in step 8,
    // while keeping the segment in the review queue (Gemini is unverified).
    updated[i] = {
      ...seg,
      doc_type: g.doc_type,
      mapped_category: category,
      confidence_score: g.confidence,
      detection_method: "gemini",
    };
  }

  return updated;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
