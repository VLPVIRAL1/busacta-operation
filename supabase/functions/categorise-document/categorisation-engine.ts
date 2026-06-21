// Copy of src/lib/ops/categorisation-engine.ts for Deno Edge Function.
// Canonical source: src/lib/ops/categorisation-engine.ts
// Keep in sync manually until a shared-module strategy is adopted.

import { classify, calibrateConfidence, isModelReady, type NbModel } from "./categorisation-ml.ts";

// ── Types ──────────────────────────────────────────────────────────

export type CatRule = {
  id: string;
  doc_type: string;
  signal_text: string;
  signal_type: "filename" | "form-code" | "keyword" | "regex";
  signal_source: "filename" | "ocr";
  weight: number;
  priority: number;
};

export type CatConfig = {
  doc_type: string;
  display_name: string;
  mapped_category: string;
  country_code: string;
  min_confidence: number;
  allow_multi_segment: boolean;
  highlight_color: string;
  is_active: boolean;
};

export type ScoringResult = {
  doc_type: string | null;
  confidence_score: number;
  detection_method:
    | "filename"
    | "form-code"
    | "keyword"
    | "regex"
    | "ml"
    | "manual"
    | "scan_deferred";
  signals_matched: string[];
  runner_up_type: string | null;
  runner_up_score: number;
};

export type Segment = {
  index: number;
  pages: number[];
  text: string;
};

export type CategorisationOutput = {
  segment_index: number;
  segment_pages: string | null;
  doc_type: string | null;
  mapped_category: string | null;
  confidence_score: number;
  detection_method: string;
  signals_matched: string;
  runner_up_type: string | null;
  runner_up_score: number | null;
  status: "auto" | "needs_review";
  /** Raw segment text retained for ML training (truncated by the caller). */
  segment_text: string;
};

// ── Scoring Pipeline ───────────────────────────────────────────────

export function scoreSingleSegment(
  segmentText: string,
  filename: string,
  rules: CatRule[],
  isFirstSegment: boolean,
  model?: NbModel | null,
): ScoringResult {
  const scores: Record<string, number> = {};
  const matched: Record<string, string[]> = {};
  const methods: Record<string, ScoringResult["detection_method"]> = {};

  const textLower = segmentText.toLowerCase();
  const filenameLower = filename.toLowerCase();

  const trackHit = (
    docType: string,
    weight: number,
    signalText: string,
    method: ScoringResult["detection_method"],
  ) => {
    if (!matched[docType]) matched[docType] = [];
    matched[docType].push(signalText);
    if (weight > (scores[docType] ?? 0)) {
      scores[docType] = weight;
      methods[docType] = method;
    }
  };

  // Layer 1: Filename heuristics (first segment only)
  if (isFirstSegment) {
    for (const rule of rules) {
      if (rule.signal_source !== "filename") continue;
      const terms = rule.signal_text.split(",").map((t) => t.trim().toLowerCase());
      if (terms.some((term) => term && filenameLower.includes(term))) {
        trackHit(rule.doc_type, rule.weight, rule.signal_text, "filename");
      }
    }
  }

  // Layer 2: Form-code + Regex detection
  for (const rule of rules) {
    if (rule.signal_type === "form-code") {
      const terms = rule.signal_text.split(",").map((t) => t.trim().toLowerCase());
      if (terms.some((term) => term && textLower.includes(term))) {
        trackHit(rule.doc_type, rule.weight, rule.signal_text, "form-code");
      }
    } else if (rule.signal_type === "regex") {
      const pattern = rule.signal_text.replace(/^regex:/, "");
      try {
        if (new RegExp(pattern, "i").test(segmentText)) {
          trackHit(rule.doc_type, rule.weight, rule.signal_text, "regex");
        }
      } catch {
        // Invalid regex in DB — skip silently
      }
    }
  }

  // Layer 3: Keyword scoring
  for (const rule of rules) {
    if (rule.signal_type !== "keyword") continue;
    const terms = rule.signal_text.split(",").map((t) => t.trim().toLowerCase());
    if (terms.some((term) => term && textLower.includes(term))) {
      trackHit(rule.doc_type, rule.weight, rule.signal_text, "keyword");
    }
  }

  // Resolve rule-based scores first.
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const ruleTopScore = sorted.length > 0 ? sorted[0][1] : 0;
  const ruleRunnerScore = sorted.length > 1 ? sorted[1][1] : 0;

  // Layer 4: local Naive Bayes / TF-IDF fallback. Runs only when the rules are
  // cold (nothing scored >= 60) or ambiguous (top two within 10 points) and a
  // trained model is available. ML can only replace a weak rule result, never a
  // confident one — keeping rules the primary path.
  const rulesColdOrAmbiguous =
    sorted.length === 0 || ruleTopScore < 60 || ruleTopScore - ruleRunnerScore <= 10;

  if (model && rulesColdOrAmbiguous && isModelReady(model)) {
    const ml = classify(model, segmentText);
    if (ml.doc_type) {
      const mlConfidence = calibrateConfidence(ml.prob);
      if (mlConfidence > ruleTopScore) {
        return {
          doc_type: ml.doc_type,
          confidence_score: mlConfidence,
          detection_method: "ml",
          signals_matched: [`ml:${ml.doc_type} (p=${ml.prob.toFixed(2)})`],
          runner_up_type: sorted.length > 0 ? sorted[0][0] : null,
          runner_up_score: ruleTopScore,
        };
      }
    }
  }

  if (sorted.length === 0) {
    return {
      doc_type: null,
      confidence_score: 0,
      detection_method: "keyword",
      signals_matched: [],
      runner_up_type: null,
      runner_up_score: 0,
    };
  }

  const [topType, topScore] = sorted[0];
  const [runnerType, runnerScore] = sorted.length > 1 ? sorted[1] : [null, 0];

  return {
    doc_type: topType,
    confidence_score: topScore,
    detection_method: methods[topType] ?? "keyword",
    signals_matched: matched[topType] ?? [],
    runner_up_type: runnerType,
    runner_up_score: runnerScore as number,
  };
}

// ── Segment Detection ──────────────────────────────────────────────

export function detectSegments(
  pagesTextMap: Map<number, string>,
  filename: string,
  rules: CatRule[],
): Segment[] {
  const pageNumbers = Array.from(pagesTextMap.keys()).sort((a, b) => a - b);

  if (pageNumbers.length <= 1) {
    const text = pageNumbers.length === 1 ? (pagesTextMap.get(pageNumbers[0]) ?? "") : "";
    return [{ index: 0, pages: pageNumbers, text }];
  }

  // Score each page with form-code + regex signals only (fast, high-confidence)
  const fastRules = rules.filter((r) => r.signal_type === "form-code" || r.signal_type === "regex");

  type PageScore = { page: number; topType: string | null; topScore: number };
  const pageScores: PageScore[] = pageNumbers.map((page) => {
    const pageText = pagesTextMap.get(page) ?? "";
    const result = scoreSingleSegment(pageText, filename, fastRules, false);
    return {
      page,
      topType: result.confidence_score >= 80 ? result.doc_type : null,
      topScore: result.confidence_score,
    };
  });

  // Group consecutive pages with the same detected type
  const segments: Segment[] = [];
  let currentType: string | null = pageScores[0].topType;
  let currentPages: number[] = [pageScores[0].page];
  let currentTexts: string[] = [pagesTextMap.get(pageScores[0].page) ?? ""];

  for (let i = 1; i < pageScores.length; i++) {
    const ps = pageScores[i];
    const isBoundary = ps.topType !== null && currentType !== null && ps.topType !== currentType;

    if (isBoundary) {
      segments.push({
        index: segments.length,
        pages: currentPages,
        text: currentTexts.join("\n"),
      });
      currentType = ps.topType;
      currentPages = [ps.page];
      currentTexts = [pagesTextMap.get(ps.page) ?? ""];
    } else {
      if (ps.topType !== null) currentType = ps.topType;
      currentPages.push(ps.page);
      currentTexts.push(pagesTextMap.get(ps.page) ?? "");
    }
  }

  segments.push({
    index: segments.length,
    pages: currentPages,
    text: currentTexts.join("\n"),
  });

  // If only one segment detected, use index 0 (whole document)
  if (segments.length === 1) {
    segments[0].index = 0;
  }

  return segments;
}

// ── Orchestrator ───────────────────────────────────────────────────

export function categoriseDocument(
  fullText: string,
  pagesTextMap: Map<number, string>,
  filename: string,
  rules: CatRule[],
  configs: CatConfig[],
  model?: NbModel | null,
): CategorisationOutput[] {
  const configMap = new Map(configs.map((c) => [c.doc_type, c]));
  const segments = detectSegments(pagesTextMap, filename, rules);

  return segments.map((segment, i) => {
    const result = scoreSingleSegment(segment.text, filename, rules, i === 0, model);

    const config = result.doc_type ? configMap.get(result.doc_type) : null;
    const threshold = config?.min_confidence ?? 75;

    // Ambiguous: top two within 8 points → needs_review
    const isAmbiguous =
      result.runner_up_type !== null && result.confidence_score - result.runner_up_score <= 8;

    const meetsThreshold = result.confidence_score >= threshold && !isAmbiguous;

    return {
      segment_index: segment.index,
      segment_pages: segments.length > 1 ? segment.pages.join(",") : null,
      doc_type: result.doc_type,
      mapped_category: config?.mapped_category ?? null,
      confidence_score: result.confidence_score,
      detection_method: result.detection_method,
      signals_matched: JSON.stringify(result.signals_matched),
      runner_up_type: result.runner_up_type,
      runner_up_score: result.runner_up_score || null,
      status: meetsThreshold ? "auto" : "needs_review",
      segment_text: segment.text,
    };
  });
}
