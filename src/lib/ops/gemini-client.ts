// Gemini 2.5 Flash document classifier — the single point of contact with the
// Google AI Studio API. Pure TypeScript, raw fetch (NOT @google/generative-ai —
// that package adds ~2MB to the Edge Function bundle). Imported by the Edge
// Function (synced copy) and by server functions.
//
// Never throws: every path returns a GeminiClassifyResult. Callers log the
// result to gemini_usage_log regardless of success/failure.

// ── Pricing (USD per 1M tokens — update when Google changes rates) ──

export const GEMINI_MODELS = {
  "gemini-2.5-flash": { input_per_million: 0.3, output_per_million: 2.5 },
  "gemini-2.5-flash-lite": { input_per_million: 0.1, output_per_million: 0.4 },
} as const;

export type GeminiModel = keyof typeof GEMINI_MODELS;

// ── Types ──────────────────────────────────────────────────────────

export type GeminiClassifyResult = {
  doc_type: string | null;
  confidence: number; // 0–100
  mapped_category: string | null;
  extracted_fields: Record<string, string>;
  reasoning: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: GeminiModel;
  latency_ms: number;
  /** null on success; otherwise a short code: RATE_LIMITED, TIMEOUT, INVALID_RESPONSE, HTTP_4xx/5xx, etc. */
  error_code: string | null;
};

export type ClassifyParams = {
  ocrText: string;
  filename: string;
  knownTypes: string[];
  model?: GeminiModel;
  apiKey: string;
  tier?: "free" | "paid";
  /** Safety cap on characters sent to the model (default 8000). */
  maxInputChars?: number;
};

// ── Cost ───────────────────────────────────────────────────────────

export function computeCost(
  model: GeminiModel,
  inputTokens: number,
  outputTokens: number,
  tier: "free" | "paid",
): number {
  if (tier === "free") return 0; // Free tier = no charge
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

  // Up to 2 attempts: retry once on 429 (2s) / 503 (3s).
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
      break; // network error — don't retry blindly
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

    // Success path — parse usage + content.
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
      // Reachable model but unparseable content — still record token usage.
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

  // All attempts failed — null result, cost 0, error recorded.
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

// ── Discovery: propose a new doc type + detection rules ────────────

export type ProposedRule = {
  signal_text: string;
  signal_type: "filename" | "form-code" | "keyword" | "regex";
  signal_source: "filename" | "ocr";
  weight: number;
};

export type DocTypeProposal = {
  doc_type: string; // SCREAMING_SNAKE_CASE
  display_name: string;
  country_code: string; // "US" | "IN" | "ALL"
  mapped_category: string;
  min_confidence: number;
  highlight_color: string;
  rules: ProposedRule[];
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: GeminiModel;
};

const DISCOVERY_SYSTEM_PROMPT = `You are configuring a document type detection system for a business accounting platform.
You will be given OCR-extracted text from a financial or tax document.

Your task:
1. Identify what type of document this is (e.g. Form 1098, ITR, PAN Card, Pay Stub)
2. Generate a detection rule set so the system can automatically identify future documents of this type
3. Return ONLY valid JSON — no markdown, no explanation outside the JSON

Return this exact structure:
{
  "doc_type": "FORM_1098",
  "display_name": "Form 1098 (Mortgage Interest)",
  "country_code": "US",
  "mapped_category": "Mortgage interest expense",
  "min_confidence": 80,
  "highlight_color": "#378ADD",
  "rules": [
    {
      "signal_text": "1098, form-1098, mortgage interest",
      "signal_type": "filename",
      "signal_source": "filename",
      "weight": 85
    },
    {
      "signal_text": "Form 1098, Mortgage Interest Statement",
      "signal_type": "form-code",
      "signal_source": "ocr",
      "weight": 97
    },
    {
      "signal_text": "box 1 mortgage interest received, outstanding mortgage principal",
      "signal_type": "keyword",
      "signal_source": "ocr",
      "weight": 88
    },
    {
      "signal_text": "regex:\\\\b1098\\\\b",
      "signal_type": "regex",
      "signal_source": "ocr",
      "weight": 90
    }
  ]
}

Field rules:
- doc_type: SCREAMING_SNAKE_CASE, no spaces, prefix with country if needed (e.g. FORM_1098, ITR, PAN_CARD)
- country_code: "US" for US tax forms, "IN" for Indian documents, "ALL" for universal
- min_confidence: 65–90; use higher for very unique documents (95%+ unique signals), lower for generic
- highlight_color: a readable hex color, pick from: #185FA5, #0F6E56, #854F0B, #534AB7, #993C1D, #3B6D11, #888780, #D85A30, #1D9E75, #378ADD
- Rules must include 1–2 filename signals, 1–2 form-code signals, 2–4 keyword signals, 0–2 regex signals
- signal_type "filename": comma-separated lowercase terms matching filename patterns
- signal_type "form-code": exact strings/phrases found in the document header or first page
- signal_type "keyword": distinctive multi-word phrases unique to this document type — NOT generic words
- signal_type "regex": prefix EXACTLY with "regex:" then the JS-compatible pattern
- weight: 90–99 for form-code/exact matches, 78–92 for unique keywords, 60–85 for filename hints, 85–95 for regex
- Never invent field values — only use evidence from the document text`;

export async function discoverAndProposeDocType(params: {
  ocrText: string;
  filename: string;
  apiKey: string;
  model?: GeminiModel;
  tier?: "free" | "paid";
  maxInputChars?: number;
}): Promise<DocTypeProposal> {
  const model: GeminiModel = params.model ?? "gemini-2.5-flash";
  const tier = params.tier ?? "paid";
  const maxChars = params.maxInputChars ?? 8000;
  const start = Date.now();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: DISCOVERY_SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Filename: ${params.filename || "unknown"}\n\nDocument text:\n${truncate(params.ocrText, maxChars)}`,
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
  };

  let lastErr = "UNKNOWN";
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      lastErr = "TIMEOUT";
      break;
    }
    if (res.status === 429 || res.status === 503) {
      lastErr = res.status === 429 ? "RATE_LIMITED" : "OVERLOADED";
      if (attempt === 0) {
        await sleep(res.status === 429 ? 2000 : 3000);
        continue;
      }
      break;
    }
    if (!res.ok) {
      lastErr = `HTTP_${res.status}`;
      break;
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      lastErr = "INVALID_RESPONSE";
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
      throw new Error("Gemini returned invalid JSON. Try again.");
    }

    // Normalise doc_type to SCREAMING_SNAKE_CASE.
    const docType =
      typeof parsed?.doc_type === "string"
        ? parsed.doc_type
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "_")
            .replace(/^_|_$/g, "")
        : "UNKNOWN";

    const rules: ProposedRule[] = Array.isArray(parsed?.rules)
      ? parsed.rules
          .filter((r: any) => r?.signal_text && r?.signal_type && r?.signal_source)
          .map((r: any) => ({
            signal_text: String(r.signal_text).slice(0, 2000),
            signal_type: ["filename", "form-code", "keyword", "regex"].includes(r.signal_type)
              ? (r.signal_type as ProposedRule["signal_type"])
              : "keyword",
            signal_source: r.signal_source === "filename" ? "filename" : "ocr",
            weight: clampInt(r.weight, 0, 100),
          }))
      : [];

    return {
      doc_type: docType,
      display_name: typeof parsed?.display_name === "string" ? parsed.display_name : docType,
      country_code:
        typeof parsed?.country_code === "string"
          ? parsed.country_code.slice(0, 3).toUpperCase()
          : "ALL",
      mapped_category:
        typeof parsed?.mapped_category === "string" ? parsed.mapped_category : "Other",
      min_confidence: clampInt(parsed?.min_confidence, 50, 99),
      highlight_color: /^#[0-9A-Fa-f]{6}$/.test(parsed?.highlight_color ?? "")
        ? parsed.highlight_color
        : "#378ADD",
      rules,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      model,
    };
  }
  throw new Error(`Gemini discovery failed: ${lastErr}`);
}

// ── Rules audit ────────────────────────────────────────────────────

export type RuleAuditFinding = {
  doc_type: string;
  severity: "error" | "warning" | "info";
  issue: string;
  suggestion: string;
};

const AUDIT_SYSTEM_PROMPT = `You are auditing document detection rules for a business accounting classification system.
You will receive a JSON list of document types, each with its detection rules.

Your task:
1. Review every doc type's rules for quality issues
2. Return ONLY a JSON array of findings — no markdown, no text outside the JSON

Return an array of finding objects:
[
  {
    "doc_type": "BANK_STMT",
    "severity": "warning",
    "issue": "Keyword 'debit, credit' is too generic — matches many non-bank documents",
    "suggestion": "Raise the weight on 'opening balance, closing balance' to 90 and remove the generic debit/credit keyword"
  }
]

severity levels:
- "error": rule is actively harmful (wrong regex, impossible weight, conflicts with another type)
- "warning": rule is weak, too generic, or missing a critical signal type
- "info": minor improvement opportunity

Focus on:
- Keywords that are too generic (single words, common business terms)
- Missing signal types (e.g., a doc type with no form-code rule)
- Regex patterns that may match too broadly or have syntax issues
- Weights that seem inconsistent (e.g., a filename rule with weight 99)
- Doc types with fewer than 3 rules total
- Potential ambiguity: two doc types that might score similarly on the same document

Return an empty array [] if everything looks good. Never return null or non-array.
Only report concrete, actionable issues. Limit to 20 findings maximum.`;

export async function auditDetectionRules(params: {
  configs: Array<{
    doc_type: string;
    display_name: string;
    min_confidence: number;
    country_code: string;
  }>;
  rules: Array<{
    doc_type: string;
    signal_text: string;
    signal_type: string;
    signal_source: string;
    weight: number;
    is_active: boolean;
  }>;
  apiKey: string;
  model?: GeminiModel;
  tier?: "free" | "paid";
}): Promise<{
  findings: RuleAuditFinding[];
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}> {
  const model: GeminiModel = params.model ?? "gemini-2.5-flash";
  const tier = params.tier ?? "paid";
  const start = Date.now();

  // Build a compact representation for the prompt.
  const payload = params.configs.map((cfg) => ({
    doc_type: cfg.doc_type,
    display_name: cfg.display_name,
    country_code: cfg.country_code,
    min_confidence: cfg.min_confidence,
    rules: params.rules
      .filter((r) => r.doc_type === cfg.doc_type && r.is_active)
      .map((r) => ({
        type: r.signal_type,
        source: r.signal_source,
        text: r.signal_text,
        weight: r.weight,
      })),
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: AUDIT_SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `Review these detection rules:\n${JSON.stringify(payload, null, 2)}` }],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };

  let lastErr = "UNKNOWN";
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      lastErr = "TIMEOUT";
      break;
    }
    if (res.status === 429 || res.status === 503) {
      lastErr = res.status === 429 ? "RATE_LIMITED" : "OVERLOADED";
      if (attempt === 0) {
        await sleep(res.status === 429 ? 2000 : 3000);
        continue;
      }
      break;
    }
    if (!res.ok) {
      lastErr = `HTTP_${res.status}`;
      break;
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      lastErr = "INVALID_RESPONSE";
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
      throw new Error("Gemini returned invalid JSON. Try again.");
    }

    const findings: RuleAuditFinding[] = Array.isArray(parsed)
      ? parsed
          .filter((f: any) => f?.doc_type && f?.issue)
          .map((f: any) => ({
            doc_type: String(f.doc_type),
            severity: ["error", "warning", "info"].includes(f.severity) ? f.severity : "info",
            issue: String(f.issue),
            suggestion: String(f.suggestion ?? ""),
          }))
          .slice(0, 20)
      : [];

    return { findings, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost };
  }
  throw new Error(`Gemini rule audit failed: ${lastErr}`);
}
