import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { PdfErrorState } from "./pdf-error-state";

// Lazy-loaded so react-pdf / pdfjs-dist (which need DOMMatrix) never run during SSR.
const PdfPreviewCanvas = lazy(() => import("./pdf-preview-canvas"));

export type PdfSource = Blob | File | string | null | undefined;

interface Props {
  /** Preferred input: accepts a Blob/File from an upload or a remote URL. */
  source?: PdfSource;
  /** @deprecated Use `source`. Retained so existing callers keep working. */
  blob?: Blob | null;
  fileName?: string;
  className?: string;
}

function useResolvedUrl(source: PdfSource): string | null {
  return useMemo(() => {
    if (!source) return null;
    if (typeof source === "string") return source;
    try {
      return URL.createObjectURL(source);
    } catch {
      return null;
    }
  }, [source]);
}

export function PdfPreview({ source, blob, fileName = "document.pdf", className }: Props) {
  const resolved: PdfSource = source ?? blob ?? null;
  const isBlob = typeof resolved !== "string" && resolved != null;
  const url = useResolvedUrl(resolved);

  const [useFallback, setUseFallback] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);

  // Revoke object URLs we created.
  useEffect(() => {
    if (!url || !isBlob) return;
    return () => URL.revokeObjectURL(url);
  }, [url, isBlob]);

  // Reset state when input changes or user retries.
  useEffect(() => {
    setUseFallback(false);
    setLoaded(false);
    setFatal(null);
  }, [url, attempt]);

  useEffect(() => {
    if (useFallback || !url) return;
    const t = setTimeout(() => {
      if (!loaded) setUseFallback(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [url, loaded, useFallback]);

  if (!resolved || !url) return null;

  const retry = () => setAttempt((n) => n + 1);

  if (fatal) {
    return (
      <div className={cn("w-full p-4", className)}>
        <PdfErrorState message={fatal} url={url} filename={fileName} onRetry={retry} />
      </div>
    );
  }

  const openInTabFallback = (
    <PdfErrorState
      message="Your browser blocked the inline PDF viewer."
      url={url}
      filename={fileName}
      onRetry={retry}
    />
  );

  return (
    <div className={cn("relative w-full overflow-auto rounded-md border bg-white", className)}>
      {!useFallback ? (
        <object
          key={`obj-${attempt}`}
          data={url}
          type="application/pdf"
          className="h-full w-full"
          onLoad={() => setLoaded(true)}
          onError={() => setUseFallback(true)}
          aria-label={fileName}
        >
          {openInTabFallback}
        </object>
      ) : (
        <Suspense
          fallback={
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading preview…
            </div>
          }
        >
          <PdfPreviewCanvas
            key={`canvas-${attempt}`}
            url={url}
            fallback={openInTabFallback}
            attemptKey={attempt}
          />
        </Suspense>
      )}

      <div className="pointer-events-none absolute right-2 top-2">
        <Button asChild size="sm" variant="secondary" className="pointer-events-auto shadow-sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open in new tab
          </a>
        </Button>
      </div>
    </div>
  );
}
