import { useEffect, useRef, useState } from "react";
import { getPdf, prefetchPages } from "@/lib/esign/pdf-cache";

export type PageSize = { width: number; height: number };

type Props = {
  url: string;
  pageIndex: number;
  onReady?: (totalPages: number, pageSize: PageSize) => void;
  /** Render width in CSS pixels. If unset, uses the PDF's intrinsic width at 1.5x. */
  renderWidth?: number;
  /**
   * Adjacent page indexes to warm in the background as soon as this page
   * starts rendering. Pass e.g. [pageIndex - 1, pageIndex + 1].
   */
  prefetchAdjacent?: number[];
  className?: string;
};

/**
 * Renders one PDF page to a canvas. Reports page count + intrinsic CSS size
 * so the field overlay can position absolutely on top.
 *
 *  - Document handles come from a per-URL cache (see pdf-cache.ts) so
 *    re-mounting a different page of the same PDF is instant.
 *  - The page area uses a skeleton sized to the previously-known dimensions
 *    while rendering, so there's no layout shift or flash of empty white.
 *  - The canvas fades in once the render task completes.
 *  - Optional `prefetchAdjacent` warms neighbouring pages in the background.
 */
export function PdfPage({
  url,
  pageIndex,
  onReady,
  renderWidth,
  prefetchAdjacent,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [painted, setPainted] = useState(false);
  const [size, setSize] = useState<PageSize | null>(null);

  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Hold prefetch list in a ref so a fresh `[pageIndex-1, pageIndex+1]`
  // array on each render does NOT retrigger the render effect (was causing
  // the signer page to freeze in a re-paint loop).
  const prefetchRef = useRef<number[] | undefined>(prefetchAdjacent);
  useEffect(() => {
    prefetchRef.current = prefetchAdjacent;
  }, [prefetchAdjacent]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    setErr(null);
    setPainted(false);
    (async () => {
      try {
        const doc = await getPdf(url);
        if (cancelled) return;
        const page = (await doc.getPage(pageIndex + 1)) as {
          getViewport: (opts: { scale: number }) => {
            width: number;
            height: number;
          };
          render: (args: unknown) => { cancel: () => void; promise: Promise<void> };
        };

        // Compute the scale so the rendered width matches renderWidth (if
        // provided); otherwise use 1.5x as before.
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = renderWidth ? renderWidth / baseViewport.width : 1.5;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await (renderTask as unknown as { promise: Promise<void> }).promise;
        if (cancelled) return;
        const nextSize = { width: viewport.width, height: viewport.height };
        setSize(nextSize);
        setPainted(true);
        onReadyRef.current?.(doc.numPages, nextSize);

        const adj = prefetchRef.current;
        if (adj && adj.length > 0) {
          prefetchPages(
            url,
            adj.filter((i) => i >= 0 && i < doc.numPages && i !== pageIndex),
          );
        }
      } catch (e) {
        if (!cancelled) {
          setErr((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        /* noop */
      }
    };
  }, [url, pageIndex, renderWidth]);

  if (err) {
    return (
      <div className="p-6 text-sm text-destructive border border-destructive/40 rounded-md">
        Failed to render PDF: {err}
      </div>
    );
  }

  // Reserve space for the page before paint so the overlay positions
  // correctly on the first frame.
  const reservedWidth = size?.width ?? renderWidth ?? 800;
  const reservedHeight = size?.height ?? Math.round(reservedWidth * 1.294);

  return (
    <div
      className="relative"
      style={{
        width: reservedWidth,
        height: reservedHeight,
      }}
    >
      <canvas
        ref={canvasRef}
        className={
          (className ?? "") +
          " transition-opacity duration-300 ease-out " +
          (painted ? "opacity-100" : "opacity-0")
        }
        aria-hidden={!painted}
      />
      {!painted && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-muted/30 to-muted/10"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="esign-page-skeleton" />
        </div>
      )}
    </div>
  );
}
