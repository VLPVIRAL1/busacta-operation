// Client-only: react-pdf / pdfjs-dist reference DOMMatrix at module load,
// which doesn't exist in the SSR / Worker runtime. Import this module only
// from code paths that run in the browser (lazy components, click handlers,
// dynamic imports inside event/exporter functions).
import { pdfjs } from "react-pdf";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - vite handles ?url
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc as string;
}

export { pdfjs };

export class PdfWorkerUnavailableError extends Error {
  constructor(
    public readonly workerUrl: string,
    cause?: unknown,
  ) {
    super(`PDF engine failed to start. Worker asset could not be loaded from ${workerUrl}.`);
    this.name = "PdfWorkerUnavailableError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

let workerCheck: Promise<void> | null = null;

/**
 * Verify the bundled pdf.js worker is reachable. Resolves once on success and
 * caches the result; rejects with `PdfWorkerUnavailableError` if the asset
 * 404s or the network is offline. See `docs/dev/pdf-worker.md`.
 */
export function ensurePdfWorker(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (workerCheck) return workerCheck;
  const url = pdfjs.GlobalWorkerOptions.workerSrc;
  if (!url) {
    workerCheck = Promise.reject(new PdfWorkerUnavailableError("<unset>"));
    return workerCheck;
  }
  workerCheck = fetch(url, { method: "HEAD", cache: "force-cache" })
    .then((res) => {
      if (!res.ok) throw new PdfWorkerUnavailableError(url);
    })
    .catch((err) => {
      workerCheck = null; // allow retry
      if (err instanceof PdfWorkerUnavailableError) throw err;
      throw new PdfWorkerUnavailableError(url, err);
    });
  return workerCheck;
}
