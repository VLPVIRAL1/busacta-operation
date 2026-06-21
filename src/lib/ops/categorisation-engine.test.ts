import { describe, it, expect } from "vitest";
import {
  scoreSingleSegment,
  detectSegments,
  categoriseDocument,
  type CatRule,
  type CatConfig,
} from "./categorisation-engine";

const RULES: CatRule[] = [
  { id: "1", doc_type: "W2", signal_text: "w2, w-2, wage and tax statement", signal_type: "filename", signal_source: "filename", weight: 90, priority: 0 },
  { id: "2", doc_type: "W2", signal_text: "Form W-2, Form W2", signal_type: "form-code", signal_source: "ocr", weight: 97, priority: 0 },
  { id: "3", doc_type: "W2", signal_text: "wages tips other compensation", signal_type: "keyword", signal_source: "ocr", weight: 82, priority: 0 },
  { id: "4", doc_type: "W2", signal_text: "employer identification number", signal_type: "keyword", signal_source: "ocr", weight: 78, priority: 0 },
  { id: "5", doc_type: "1099_MISC", signal_text: "1099, 1099-misc", signal_type: "filename", signal_source: "filename", weight: 88, priority: 0 },
  { id: "6", doc_type: "1099_MISC", signal_text: "Form 1099-MISC", signal_type: "form-code", signal_source: "ocr", weight: 97, priority: 0 },
  { id: "7", doc_type: "1099_MISC", signal_text: "nonemployee compensation", signal_type: "keyword", signal_source: "ocr", weight: 92, priority: 0 },
  { id: "8", doc_type: "GST_INVOICE", signal_text: "gst, invoice, tax invoice, gstin", signal_type: "filename", signal_source: "filename", weight: 82, priority: 0 },
  { id: "9", doc_type: "GST_INVOICE", signal_text: "regex:\\bGSTIN\\b", signal_type: "regex", signal_source: "ocr", weight: 95, priority: 0 },
  { id: "10", doc_type: "GST_INVOICE", signal_text: "CGST, SGST, IGST", signal_type: "keyword", signal_source: "ocr", weight: 90, priority: 0 },
  { id: "11", doc_type: "BANK_STMT", signal_text: "opening balance, closing balance", signal_type: "keyword", signal_source: "ocr", weight: 85, priority: 0 },
];

const CONFIGS: CatConfig[] = [
  { doc_type: "W2", display_name: "Form W-2", mapped_category: "Salary income", country_code: "US", min_confidence: 75, allow_multi_segment: true, highlight_color: "#185FA5", is_active: true },
  { doc_type: "1099_MISC", display_name: "Form 1099-MISC", mapped_category: "Freelance income", country_code: "US", min_confidence: 70, allow_multi_segment: true, highlight_color: "#0F6E56", is_active: true },
  { doc_type: "GST_INVOICE", display_name: "GST Invoice", mapped_category: "Purchase / expense", country_code: "IN", min_confidence: 72, allow_multi_segment: true, highlight_color: "#534AB7", is_active: true },
  { doc_type: "BANK_STMT", display_name: "Bank statement", mapped_category: "Bank reconciliation", country_code: "ALL", min_confidence: 65, allow_multi_segment: false, highlight_color: "#888780", is_active: true },
];

describe("scoreSingleSegment", () => {
  it("detects W-2 from form-code in OCR text", () => {
    const result = scoreSingleSegment(
      "Form W-2 Wage and Tax Statement 2024\nEmployer EIN: 12-3456789\nwages tips other compensation 50000",
      "document.pdf",
      RULES,
      true,
    );
    expect(result.doc_type).toBe("W2");
    expect(result.confidence_score).toBe(97);
    expect(result.detection_method).toBe("form-code");
    expect(result.signals_matched.length).toBeGreaterThan(0);
  });

  it("detects W-2 from filename", () => {
    const result = scoreSingleSegment("", "employee_w2_2024.pdf", RULES, true);
    expect(result.doc_type).toBe("W2");
    expect(result.confidence_score).toBe(90);
    expect(result.detection_method).toBe("filename");
  });

  it("detects GST Invoice via regex", () => {
    const result = scoreSingleSegment(
      "Tax Invoice\nGSTIN: 27AADCB2230M1Z3\nCGST 9%\nSGST 9%",
      "inv_123.pdf",
      RULES,
      true,
    );
    expect(result.doc_type).toBe("GST_INVOICE");
    expect(result.confidence_score).toBe(95);
  });

  it("returns null doc_type when no signals match", () => {
    const result = scoreSingleSegment(
      "Random unrelated text about cooking recipes",
      "recipe.pdf",
      RULES,
      true,
    );
    expect(result.doc_type).toBeNull();
    expect(result.confidence_score).toBe(0);
  });

  it("uses MAX not SUM for scoring", () => {
    const result = scoreSingleSegment(
      "Form W-2 employer identification number wages tips other compensation",
      "doc.pdf",
      RULES,
      true,
    );
    // Should be 97 (form-code weight), not 97+82+78
    expect(result.confidence_score).toBe(97);
  });

  it("skips filename matching for non-first segments", () => {
    const result = scoreSingleSegment("", "w2_form.pdf", RULES, false);
    expect(result.doc_type).toBeNull();
  });

  it("populates runner-up correctly", () => {
    const result = scoreSingleSegment(
      "Form W-2 nonemployee compensation",
      "doc.pdf",
      RULES,
      true,
    );
    expect(result.doc_type).toBe("W2");
    expect(result.runner_up_type).toBe("1099_MISC");
    expect(result.runner_up_score).toBeGreaterThan(0);
  });
});

describe("detectSegments", () => {
  it("returns one segment for single-page documents", () => {
    const pages = new Map<number, string>();
    pages.set(1, "Form W-2 Wage and Tax Statement");
    const segments = detectSegments(pages, "doc.pdf", RULES);
    expect(segments).toHaveLength(1);
    expect(segments[0].index).toBe(0);
    expect(segments[0].pages).toEqual([1]);
  });

  it("splits multi-type documents at page boundaries", () => {
    const pages = new Map<number, string>();
    pages.set(1, "Form W-2 Wage and Tax Statement 2024");
    pages.set(2, "Form 1099-MISC Miscellaneous Information");
    const segments = detectSegments(pages, "combined.pdf", RULES);
    expect(segments.length).toBe(2);
    expect(segments[0].pages).toEqual([1]);
    expect(segments[1].pages).toEqual([2]);
  });

  it("groups consecutive pages of same type", () => {
    const pages = new Map<number, string>();
    pages.set(1, "Form W-2 page 1");
    pages.set(2, "Form W-2 page 2 continued");
    pages.set(3, "Form 1099-MISC different document");
    const segments = detectSegments(pages, "combined.pdf", RULES);
    expect(segments.length).toBe(2);
    expect(segments[0].pages).toEqual([1, 2]);
    expect(segments[1].pages).toEqual([3]);
  });
});

describe("categoriseDocument", () => {
  it("returns auto status when confidence meets threshold", () => {
    const pages = new Map<number, string>();
    pages.set(1, "Form W-2 Wage and Tax Statement wages tips other compensation");
    const results = categoriseDocument(
      "Form W-2 Wage and Tax Statement wages tips other compensation",
      pages,
      "w2.pdf",
      RULES,
      CONFIGS,
    );
    expect(results).toHaveLength(1);
    expect(results[0].doc_type).toBe("W2");
    expect(results[0].status).toBe("auto");
    expect(results[0].mapped_category).toBe("Salary income");
  });

  it("returns needs_review when ambiguous (top two within 8 points)", () => {
    // Create a scenario where both W2 and 1099_MISC score similarly
    const ambiguousRules: CatRule[] = [
      { id: "a", doc_type: "W2", signal_text: "tax form", signal_type: "keyword", signal_source: "ocr", weight: 80, priority: 0 },
      { id: "b", doc_type: "1099_MISC", signal_text: "tax document", signal_type: "keyword", signal_source: "ocr", weight: 75, priority: 0 },
    ];
    const pages = new Map<number, string>();
    pages.set(1, "tax form tax document");
    const results = categoriseDocument("tax form tax document", pages, "doc.pdf", ambiguousRules, CONFIGS);
    expect(results[0].status).toBe("needs_review");
  });

  it("handles multi-segment documents", () => {
    const pages = new Map<number, string>();
    pages.set(1, "Form W-2 Wage and Tax Statement 2024");
    pages.set(2, "Form 1099-MISC nonemployee compensation");
    const fullText = "Form W-2 Wage and Tax Statement 2024\nForm 1099-MISC nonemployee compensation";
    const results = categoriseDocument(fullText, pages, "combined.pdf", RULES, CONFIGS);
    expect(results.length).toBe(2);
    expect(results[0].doc_type).toBe("W2");
    expect(results[1].doc_type).toBe("1099_MISC");
    expect(results[0].segment_pages).toBe("1");
    expect(results[1].segment_pages).toBe("2");
  });
});
