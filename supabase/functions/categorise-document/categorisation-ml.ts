// Copy of src/lib/ops/categorisation-ml.ts for Deno Edge Function.
// Canonical source: src/lib/ops/categorisation-ml.ts
// Keep in sync manually until a shared-module strategy is adopted.
//
// Local document-type classifier: TF-IDF + multinomial Naive Bayes.

// ── Types ──────────────────────────────────────────────────────────

export type TrainingSample = {
  text: string;
  label: string;
  status?: string;
};

export type NbModel = {
  classes: string[];
  priors: Record<string, number>;
  tokenLogProb: Record<string, Record<string, number>>;
  defaultLogProb: Record<string, number>;
  idf: Record<string, number>;
  vocabSize: number;
  sampleCount: number;
  perClassCounts: Record<string, number>;
};

export type ClassifyResult = {
  doc_type: string | null;
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

const ALPHA = 1;

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

  const df = new Map<string, number>();
  for (const d of docs) {
    for (const token of d.counts.keys()) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const idf: Record<string, number> = {};
  for (const [token, freq] of df) idf[token] = Math.log((N + 1) / (freq + 1)) + 1;

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

  const max = Math.max(...logScores);
  const exps = logScores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;

  let bestIdx = 0;
  for (let i = 1; i < logScores.length; i++) {
    if (logScores[i] > logScores[bestIdx]) bestIdx = i;
  }

  return { doc_type: model.classes[bestIdx], prob: exps[bestIdx] / sum };
}

export function calibrateConfidence(prob: number): number {
  const p = Math.max(0, Math.min(1, prob));
  return Math.max(0, Math.min(95, Math.round(Math.pow(p, 1.5) * 100)));
}

export function isModelReady(model: NbModel | null, minPerClass = 30): boolean {
  if (!model) return false;
  return Object.values(model.perClassCounts).some((c) => c >= minPerClass);
}
