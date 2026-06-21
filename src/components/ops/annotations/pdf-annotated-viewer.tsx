import { useState, useRef, useEffect, useMemo } from "react";
import { Document, Page } from "react-pdf";
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnnotationLayer, type AnnotationLayerProps } from "./annotation-layer";
import "@/lib/pdf/pdf-worker";
import { ensurePdfWorker, PdfWorkerUnavailableError } from "@/lib/pdf/pdf-worker";
import { PdfErrorState } from "@/components/shared/pdf-error-state";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

type PassThrough = Omit<AnnotationLayerProps, "pageNumber" | "width" | "height">;

export function PdfAnnotatedViewer({
  url: source,
  initialPage = 1,
  ...layerProps
}: { url: string | Blob; initialPage?: number } & PassThrough) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [scale, setScale] = useState(1.2);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Normalize Blob → object URL; pass strings straight through.
  const url = useMemo(() => {
    if (typeof source === "string") return source;
    try {
      return URL.createObjectURL(source);
    } catch {
      return "";
    }
  }, [source]);
  useEffect(() => {
    if (typeof source === "string" || !url) return;
    return () => URL.revokeObjectURL(url);
  }, [source, url]);

  useEffect(() => setPage(initialPage), [initialPage]);
  useEffect(() => {
    setLoadError(null);
    ensurePdfWorker().catch((e: unknown) => {
      setLoadError(
        e instanceof PdfWorkerUnavailableError ? e.message : "PDF engine failed to start.",
      );
    });
  }, [url, attempt]);

  // react-pdf reloads the document on every render when `file` is a primitive
  // string or new object literal; memoise so the signed URL is fetched once.
  const fileProp = useMemo(() => ({ url, withCredentials: false }), [url, attempt]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b bg-muted/40 px-2 py-1 text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">
          {page} / {numPages || "–"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={page >= numPages}
          onClick={() => setPage((p) => Math.min(numPages, p + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="mx-2 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">{Math.round(scale * 100)}%</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setScale((s) => Math.min(3, s + 0.2))}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900/60">
        {loadError ? (
          <PdfErrorState
            message={loadError}
            url={url}
            onRetry={() => setAttempt((n) => n + 1)}
            className="my-10"
          />
        ) : (
          <div ref={wrapRef} className="mx-auto inline-block relative">
            <Document
              file={fileProp}
              onLoadSuccess={({ numPages: n }) => {
                setNumPages(n);
                setLoadError(null);
              }}
              onLoadError={(err) => {
                setLoadError(err?.message ?? "Failed to load PDF");
              }}
              loading={
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading PDF…
                </div>
              }
            >
              <div className="relative">
                <Page
                  pageNumber={page}
                  scale={scale}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  onRenderSuccess={() => {
                    const c = wrapRef.current?.querySelector("canvas");
                    if (c) setSize({ w: c.clientWidth, h: c.clientHeight });
                  }}
                />
                {size && (
                  <AnnotationLayer
                    {...layerProps}
                    pageNumber={page}
                    width={size.w}
                    height={size.h}
                  />
                )}
              </div>
            </Document>
          </div>
        )}
      </div>
    </div>
  );
}
