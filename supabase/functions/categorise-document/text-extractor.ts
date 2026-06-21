// PDF text extraction using unpdf — returns per-page text for segment detection.
// Phase 1: text-layer PDFs only. Scanned images get scan_deferred.
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

export type ExtractionResult = {
  status: "ok" | "scan_deferred" | "failed";
  fullText: string;
  pagesTextMap: Map<number, string>;
  totalPages: number;
  errorMessage?: string;
};

const MIN_USABLE_CHARS = 50;

export async function extractPdfText(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ExtractionResult> {
  const empty = {
    fullText: "",
    pagesTextMap: new Map<number, string>(),
    totalPages: 0,
  };

  // TODO Phase 2: add Tesseract.js fallback for image/* and scanned PDFs here.
  if (mimeType !== "application/pdf") {
    return { status: "scan_deferred", ...empty };
  }

  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, {
      mergePages: false,
    });

    const pagesTextMap = new Map<number, string>();
    const pages = Array.isArray(text) ? text : [text];
    pages.forEach((pageText, i) => {
      pagesTextMap.set(i + 1, (pageText ?? "").trim());
    });

    const fullText = pages.join("\n").trim();

    if (fullText.replace(/\s/g, "").length < MIN_USABLE_CHARS) {
      return { status: "scan_deferred", fullText, pagesTextMap, totalPages };
    }

    return { status: "ok", fullText, pagesTextMap, totalPages };
  } catch (err) {
    return {
      status: "failed",
      ...empty,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
