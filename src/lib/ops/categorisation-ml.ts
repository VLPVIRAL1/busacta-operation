// Local document-type classifier: TF-IDF + multinomial Naive Bayes.
// Zero framework dependencies — importable by both the TanStack Start server
// functions and the Supabase Edge Function (which keeps a synced copy).
//
// This is Layer 4's primary classifier. It trains on human-verified labels
// (confirmed / overridden) plus Gemini-bootstrapped labels, and runs only when
// the rule-based layers are cold or ambiguous. The model is JSON-serializable
// so it can be stored in categorisation_ml_model.model_json.

// ── Types ──────────────────────────────────────────────────────────

export type TrainingSample = {
  text: string;
  label: string;
  /** 'confirmed' | 'overridden' | 'gemini_labelled' — used to filter corpus. */
  status?: string;
};

export type NbModel = {
  /** Distinct doc_type labels the model can predict. */
  classes: string[];
  /** ln(prior) per class. */
  priors: Record<string, number>;
  /** ln P(token | class) per class, only for tokens seen in that class. */
  tokenLogProb: Record<string, Record<string, number>>;
  /** ln P(unseen token | class) fallback per class (Laplace smoothing). */
  defaultLogProb: Record<string, number>;
  /** Inverse document frequency per vocabulary token. */
  idf: Record<string, number>;
  vocabSize: number;
  sampleCount: number;
  /** Trained sample count per class (for diagnostics / progress UI). */
  perClassCounts: Record<string, number>;
};

export type ClassifyResult = {
  doc_type: string | null;
  /** Normalized (softmax) probability of the winning class, 0–1. */
  prob: number;
};

// ── Tokenizer ──────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "were",
  "be",
  "by",
  "with",
  "as",
  "at",
  "this",
  "that",
  "it",
  "from",
  "no",
  "not",
  "you",
  "your",
  "we",
  "our",
  "they",
  "their",
  "i",
  "he",
  "she",
]);

/**
 * Lowercase, strip non-alphanumerics, drop stopwords and 1-char tokens, then
 * emit unigrams plus adjacent bigrams (bigrams help multi-word form labels
 * like "tax invoice" or "wages tips"). Deterministic — same input, same output.
 */
export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  const tokens: string[] = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]}_${words[i + 1]}`);
  }
  return tokens;
}

function termCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

// ── Training ───────────────────────────────────────────────────────

const ALPHA = 1; // Laplace smoothing

/**
 * Train a multinomial Naive Bayes model with TF-IDF-weighted term counts.
 *
 * @param samples  Labeled documents.
 * @param opts.includeGeminiLabelled  When false, rows with status
 *   'gemini_labelled' are excluded so the model trains only on human-verified
 *   labels. Default true — Gemini labels seed the corpus during cold start,
 *   but remain a distinct status so admins can spot-check them.
 */
export function trainNaiveBayes(
  samples: TrainingSample[],
  opts: { includeGeminiLabelled?: boolean } = {},
): NbModel {
  const includeGemini = opts.includeGeminiLabelled ?? true;
  const corpus = samples.filter(
    (s) => s.text && s.label && (includeGemini || s.status !== "gemini_labelled"),
  );

  const N = corpus.length;
  const docs = corpus.map((s) => ({
    label: s.label,
    counts: termCounts(tokenize(s.text)),
  }));

  // Document frequency → IDF.
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const token of d.counts.keys()) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  const idf: Record<string, number> = {};
  for (const [token, freq] of df) {
    idf[token] = Math.log((N + 1) / (freq + 1)) + 1; // smoothed, always > 0
  }

  // Accumulate TF-IDF weighted token mass per class.
  const classMass: Record<string, Record<string, number>> = {};
  const classTotal: Record<string, number> = {};
  const perClassCounts: Record<string, number> = {};

  for (const d of docs) {
    perClassCounts[d.label] = (perClassCounts[d.label] ?? 0) + 1;
    classMass[d.label] ??= {};
    for (const [token, tf] of d.counts) {
      const w = tf * (idf[token] ?? 1);
      classMass[d.label][token] = (classMass[d.label][token] ?? 0) + w;
      classTotal[d.label] = (classTotal[d.label] ?? 0) + w;
    }
  }

  const classes = Object.keys(perClassCounts);
  const vocabSize = Object.keys(idf).length;

  const priors: Record<string, number> = {};
  const tokenLogProb: Record<string, Record<string, number>> = {};
  const defaultLogProb: Record<string, number> = {};

  for (const cls of classes) {
    priors[cls] = Math.log(perClassCounts[cls] / N);
    const denom = (classTotal[cls] ?? 0) + ALPHA * vocabSize;
    defaultLogProb[cls] = Math.log(ALPHA / denom);
    tokenLogProb[cls] = {};
    for (const [token, mass] of Object.entries(classMass[cls] ?? {})) {
      tokenLogProb[cls][token] = Math.log((mass + ALPHA) / denom);
    }
  }

  return {
    classes,
    priors,
    tokenLogProb,
    defaultLogProb,
    idf,
    vocabSize,
    sampleCount: N,
    perClassCounts,
  };
}

// ── Inference ──────────────────────────────────────────────────────

/**
 * Classify a document. Returns the winning doc_type and its softmax-normalized
 * probability across the model's classes. Returns null when the model is empty.
 */
export function classify(model: NbModel, text: string): ClassifyResult {
  if (!model.classes.length) return { doc_type: null, prob: 0 };

  const counts = termCounts(tokenize(text));

  const logScores = model.classes.map((cls) => {
    let score = model.priors[cls] ?? 0;
    for (const [token, tf] of counts) {
      const weight = tf * (model.idf[token] ?? 1);
      const lp = model.tokenLogProb[cls]?.[token] ?? model.defaultLogProb[cls];
      score += weight * lp;
    }
    return score;
  });

  // Softmax for a normalized probability (stable: subtract max).
  const max = Math.max(...logScores);
  const exps = logScores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;

  let bestIdx = 0;
  for (let i = 1; i < logScores.length; i++) {
    if (logScores[i] > logScores[bestIdx]) bestIdx = i;
  }

  return {
    doc_type: model.classes[bestIdx],
    prob: exps[bestIdx] / sum,
  };
}

/**
 * Map a softmax probability to a conservative 0–100 confidence score that
 * slots into the engine's min_confidence gate. The exponent biases mid-range
 * probabilities downward so a fallback classifier rarely auto-passes on its
 * own — borderline calls land in needs_review.
 */
export function calibrateConfidence(prob: number): number {
  const p = Math.max(0, Math.min(1, prob));
  return Math.max(0, Math.min(95, Math.round(Math.pow(p, 1.5) * 100)));
}

/** True once the model has at least `minPerClass` samples in some class. */
export function isModelReady(model: NbModel | null, minPerClass = 30): boolean {
  if (!model) return false;
  return Object.values(model.perClassCounts).some((c) => c >= minPerClass);
}
