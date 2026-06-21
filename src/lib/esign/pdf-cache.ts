/**
 * Per-URL PDF document cache for pdfjs-dist.
 *
 * The signer and the field-placement editor both render multiple pages of
 * the same PDF. Without a cache, each `<PdfPage>` mount kicks off a fresh
 * `getDocument` (network fetch + parse + worker bootstrap), which is the
 * root cause of the flicker users see when navigating pages, scrolling,
 * or re-opening the signing link.
 *
 * This module memoises the document promise per URL and exposes a small
 * helper to warm the cache for adjacent pages so they're ready before the
 * user reaches them.
 *
 * IMPORTANT: pdfjs-dist references browser globals (`DOMMatrix`) at module
 * scope, so we only ever import it dynamically and guard against SSR.
 */

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<unknown>;
};

const docCache = new Map<string, Promise<PdfDocument>>();
const pagePrefetched = new Map<string, Set<number>>();

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const { default: pdfWorker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  }
  return pdfjs;
}

export async function getPdf(url: string): Promise<PdfDocument> {
  if (typeof window === "undefined") {
    throw new Error("pdf-cache: cannot run on the server");
  }
  const existing = docCache.get(url);
  if (existing) return existing;
  const promise = (async () => {
    const pdfjs = await loadPdfjs();
    const loadingTask = pdfjs.getDocument(url);
    return (await loadingTask.promise) as unknown as PdfDocument;
  })();
  docCache.set(url, promise);
  // Drop the entry on failure so subsequent mounts can retry.
  promise.catch(() => {
    docCache.delete(url);
  });
  return promise;
}

/**
 * Warm the cache for the given page indexes (0-based) of this URL.
 * Safe to call many times — already-prefetched pages are skipped.
 */
export function prefetchPages(url: string, indexes: number[]): void {
  if (typeof window === "undefined") return;
  const seen = pagePrefetched.get(url) ?? new Set<number>();
  pagePrefetched.set(url, seen);
  for (const idx of indexes) {
    if (idx < 0 || seen.has(idx)) continue;
    seen.add(idx);
    (async () => {
      try {
        const doc = await getPdf(url);
        if (idx + 1 > doc.numPages) return;
        await doc.getPage(idx + 1);
      } catch {
        seen.delete(idx);
      }
    })();
  }
}

/** Drop everything we know about a URL (used after a signed-URL refresh). */
export function invalidatePdf(url: string): void {
  docCache.delete(url);
  pagePrefetched.delete(url);
}
