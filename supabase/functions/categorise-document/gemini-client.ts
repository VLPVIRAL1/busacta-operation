// Copy of src/lib/ops/gemini-client.ts for Deno Edge Function.
// Canonical source: src/lib/ops/gemini-client.ts
// Keep in sync manually until a shared-module strategy is adopted.
//
// Gemini 2.5 Flash document classifier — raw fetch, never throws.

// ── Pricing (USD per 1M tokens) ────────────────────────────────────

export const GEMINI_MODELS = {
  "gemini-2.5-flash": { input_per_million: 0.3, output_per_million: 2.5 },
  "gemini-2.5-flash-lite": { input_per_million: 0.1, output_per_million: 0.4 },
} as const;

export type GeminiModel = keyof typeof GEMINI_MODELS;

// ── Types ──────────────────────────────────────────────────────────

export type GeminiClassifyResult = {
  doc_type: string | null;
  confidence: number;
  mapped_category: string | null;
  extracted_fields: Record<string, string>;
  reasoning: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: GeminiModel;
  latency_ms: number;
  error_code: string | null;
};

export type ClassifyParams = {
  ocrText: string;
  filename: string;
  knownTypes: string[];
  model?: GeminiModel;
  apiKey: string;
  tier?: "free" | "paid";
  maxInputChars?: number;
};

// ── Cost ───────────────────────────────────────────────────────────

export function computeCost(
  model: GeminiModel,
  inputTokens: number,
  outputTokens: number,
  tier: "free" | "paid",
): number {
  if (tier === "free") return 0;
  const rates = GEMINI_MODELS[model];
  return (
    (inputTokens / 1_000_000) * rates.input_per_million +
    (outputTokens / 1_000_000) * rates.output_per_million
  );
}

// ── Prompt ─────────────────────────────────────────────────────────

function buildSystemPrompt(knownTypes: string[]): string {
  return `You are a document classification specialist for a business accounting system.
You will be given OCR-extracted text from a tax or financial document.

Your task:
1. Identify the document type from this list: ${knownTypes.join(", ")}
2. Extract the most important fields (payer/employer name, ID numbers, key amounts)
3. Return ONLY valid JSON — no markdown, no explanation outside the JSON

Return this exact structure:
{
  "doc_type": "<type from list or null if uncertain>",
  "confidence": <0-100 integer>,
  "mapped_category": "<accounting category>",
  "extracted_fields": {
    "<field_name>": "<value>"
  },
  "reasoning": "<one sentence explaining why you chose this type>"
}

Rules:
- If the document does not match any known type, return doc_type: null
- confidence below 70 means you are not sure — return that honestly
- Extract only fields you can clearly see in the text
- Never invent field values
- For Indian documents: look for GSTIN, TAN, PAN, assessment year
- For US documents: look for EIN, SSN, form numbers (W-2, 1099, etc.)`;
}

// ── Helpers ────────────────────────────────────────────────────────

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n[...truncated]";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Main classify ──────────────────────────────────────────────────

export async function classifyWithGemini(params: ClassifyParams): Promise<GeminiClassifyResult> {
  const model: GeminiModel = params.model ?? "gemini-2.5-flash";
  const tier = params.tier ?? "paid";
  const maxChars = params.maxInputChars ?? 8000;
  const start = Date.now();

  const base: GeminiClassifyResult = {
    doc_type: null,
    confidence: 0,
    mapped_category: null,
    extracted_fields: {},
    reasoning: "",
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    model,
    latency_ms: 0,
    error_code: null,
  };

  // Google AI Studio uses API-key-in-query-param auth, not Bearer tokens.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(params.knownTypes) }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Filename: ${params.filename}\n\nDocument text:\n${truncate(params.ocrText, maxChars)}`,
          },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };

  let lastErrorCode = "UNKNOWN";
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      lastErrorCode = "TIMEOUT";
      break;
    }

    if (res.status === 429 || res.status === 503) {
      lastErrorCode = res.status === 429 ? "RATE_LIMITED" : "OVERLOADED";
      if (attempt === 0) {
        await sleep(res.status === 429 ? 2000 : 3000);
        continue;
      }
      break;
    }

    if (!res.ok) {
      lastErrorCode = `HTTP_${res.status}`;
      break;
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      lastErrorCode = "INVALID_RESPONSE";
      break;
    }

    const usage = json?.usageMetadata ?? {};
    const inputTokens = Number(usage.promptTokenCount ?? 0);
    const outputTokens = Number(usage.candidatesTokenCount ?? 0);
    const cost = computeCost(model, inputTokens, outputTokens, tier);

    const rawText: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: any;
    try {
      parsed = JSON.parse(stripJsonFences(rawText));
    } catch {
      return {
        ...base,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
        latency_ms: Date.now() - start,
        error_code: "INVALID_RESPONSE",
      };
    }

    const docType =
      typeof parsed?.doc_type === "string" && params.knownTypes.includes(parsed.doc_type)
        ? parsed.doc_type
        : null;

    return {
      doc_type: docType,
      confidence: clampInt(parsed?.confidence, 0, 100),
      mapped_category: typeof parsed?.mapped_category === "string" ? parsed.mapped_category : null,
      extracted_fields:
        parsed?.extracted_fields && typeof parsed.extracted_fields === "object"
          ? parsed.extracted_fields
          : {},
      reasoning: typeof parsed?.reasoning === "string" ? parsed.reasoning : "",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      model,
      latency_ms: Date.now() - start,
      error_code: null,
    };
  }

  return {
    ...base,
    latency_ms: Date.now() - start,
    error_code: lastErrorCode,
  };
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}
