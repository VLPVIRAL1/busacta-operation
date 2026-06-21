import { describe, it, expect } from "vitest";
import {
  tokenize,
  trainNaiveBayes,
  classify,
  calibrateConfidence,
  isModelReady,
  type TrainingSample,
} from "./categorisation-ml";

describe("tokenize", () => {
  it("is deterministic — same input yields same tokens", () => {
    const a = tokenize("Form W-2 Wage and Tax Statement");
    const b = tokenize("Form W-2 Wage and Tax Statement");
    expect(a).toEqual(b);
  });

  it("lowercases, strips punctuation, drops stopwords, emits bigrams", () => {
    const tokens = tokenize("Tax Invoice and the GSTIN");
    expect(tokens).toContain("tax");
    expect(tokens).toContain("invoice");
    expect(tokens).toContain("tax_invoice"); // adjacent bigram
    expect(tokens).not.toContain("and"); // stopword removed
    expect(tokens).not.toContain("the");
  });

  it("returns no bigram for a single content word", () => {
    expect(tokenize("invoice").filter((t) => t.includes("_"))).toHaveLength(0);
  });
});

describe("trainNaiveBayes + classify", () => {
  const samples: TrainingSample[] = [
    { text: "Form W-2 wages tips other compensation federal income tax withheld", label: "W2" },
    { text: "W-2 wage and tax statement employer EIN social security wages", label: "W2" },
    { text: "wages tips compensation medicare tax withheld W-2 employer", label: "W2" },
    { text: "GST tax invoice CGST SGST IGST place of supply HSN code", label: "GST_INVOICE" },
    { text: "tax invoice GSTIN taxable value CGST SGST total amount", label: "GST_INVOICE" },
    { text: "invoice GSTIN IGST HSN SAC code place of supply", label: "GST_INVOICE" },
  ];

  it("learns a clear two-class split", () => {
    const model = trainNaiveBayes(samples);
    expect(model.classes.sort()).toEqual(["GST_INVOICE", "W2"]);

    const w2 = classify(model, "this document shows wages tips and medicare tax withheld on a W-2");
    expect(w2.doc_type).toBe("W2");
    expect(w2.prob).toBeGreaterThan(0.5);

    const gst = classify(model, "tax invoice with CGST SGST and a GSTIN number");
    expect(gst.doc_type).toBe("GST_INVOICE");
    expect(gst.prob).toBeGreaterThan(0.5);
  });

  it("excludes gemini_labelled rows when includeGeminiLabelled is false", () => {
    const withGemini: TrainingSample[] = [
      ...samples,
      {
        text: "completely different aadhaar identity card",
        label: "AADHAAR",
        status: "gemini_labelled",
      },
    ];
    const human = trainNaiveBayes(withGemini, { includeGeminiLabelled: false });
    expect(human.classes).not.toContain("AADHAAR");

    const all = trainNaiveBayes(withGemini, { includeGeminiLabelled: true });
    expect(all.classes).toContain("AADHAAR");
  });

  it("returns null doc_type for an empty model", () => {
    const empty = trainNaiveBayes([]);
    expect(classify(empty, "anything").doc_type).toBeNull();
  });
});

describe("calibrateConfidence", () => {
  it("stays within 0–95 bounds", () => {
    expect(calibrateConfidence(0)).toBe(0);
    expect(calibrateConfidence(1)).toBe(95);
    expect(calibrateConfidence(0.5)).toBeGreaterThanOrEqual(0);
    expect(calibrateConfidence(0.5)).toBeLessThanOrEqual(95);
  });

  it("is conservative — a coin-flip probability maps below 50", () => {
    expect(calibrateConfidence(0.5)).toBeLessThan(50);
  });

  it("clamps out-of-range input", () => {
    expect(calibrateConfidence(-1)).toBe(0);
    expect(calibrateConfidence(2)).toBe(95);
  });
});

describe("isModelReady", () => {
  it("is false for null or under-trained models", () => {
    expect(isModelReady(null)).toBe(false);
    const sparse = trainNaiveBayes([{ text: "only one sample here", label: "X" }]);
    expect(isModelReady(sparse, 30)).toBe(false);
  });

  it("is true once a class crosses the threshold", () => {
    const many: TrainingSample[] = Array.from({ length: 30 }, (_, i) => ({
      text: `wages tips compensation W-2 sample ${i}`,
      label: "W2",
    }));
    expect(isModelReady(trainNaiveBayes(many), 30)).toBe(true);
  });
});
