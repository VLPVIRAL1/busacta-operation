import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "@/lib/pdf/pdf-worker";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";
import { ensurePdfWorker, PdfWorkerUnavailableError } from "@/lib/pdf/pdf-worker";
import { PdfErrorState } from "./pdf-error-state";

interface LazyPageProps {
  pageNumber: number;
  width: number;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

// Default aspect ratio (US Letter portrait) used to reserve scroll height
// before the real page dimensions are known.
const DEFAULT_RATIO = 11 / 8.5;

const LazyPdfPage = memo(function LazyPdfPage({ pageNumber, width, rootRef }: LazyPageProps) {
  const [visible, setVisible] = useState(pageNumber === 1);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) return;
    const el = slotRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: rootRef.current ?? null, rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootRef]);

  return (
    <div
      ref={slotRef}
      className="mb-3 flex items-center justify-center bg-white shadow-sm"
      style={{ width, height: width * ratio }}
    >
      {visible ? (
        <Page
          pageNumber={pageNumber}
          width={width}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          onLoadSuccess={(p) => {
            if (p.width > 0) setRatio(p.height / p.width);
          }}
          loading={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
      )}
    </div>
  );
});

interface Props {
  url: string;
  fallback: React.ReactNode;
  attemptKey?: number;
}

export default function PdfPreviewCanvas({ url, fallback, attemptKey = 0 }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(800);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setError(null);
    ensurePdfWorker().catch((e: unknown) => {
      setError(e instanceof PdfWorkerUnavailableError ? e.message : "PDF engine failed to start.");
    });
  }, [attemptKey]);

  // Memoise so react-pdf doesn't refetch on every render.
  const file = useMemo(() => ({ url }), [url, attemptKey]);
  const pageWidth = Math.min(width - 24, 900);

  if (error) {
    return <PdfErrorState message={error} url={url} className="m-4" />;
  }

  return (
    <div ref={ref} className="flex flex-col items-center gap-3 p-3">
      <Document
        file={file}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        onLoadError={(err) => setError(err?.message ?? "Failed to load PDF")}
        loading={
          <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Rendering preview…
          </div>
        }
        error={<>{fallback}</>}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <LazyPdfPage key={i} pageNumber={i + 1} width={pageWidth} rootRef={ref} />
        ))}
      </Document>
    </div>
  );
}
