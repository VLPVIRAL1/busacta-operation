import { useEffect, useRef, useState } from "react";
import { PdfPage, type PageSize } from "./pdf-page";

type Props = {
  url: string;
  pageIndex: number;
  renderWidth?: number;
  /** Reserve this size while not yet mounted, to avoid layout shift. */
  reservedSize?: PageSize;
  onReady?: (totalPages: number, pageSize: PageSize) => void;
  /** Render now even if off-screen (e.g. for the first page so totalPages is known fast). */
  eager?: boolean;
};

const DEFAULT_RESERVED: PageSize = { width: 720, height: 932 };

/**
 * Viewport-aware mounter for <PdfPage>.
 *
 * Pages within `MOUNT_MARGIN` of the viewport mount and render their canvas.
 * Pages far away unmount their canvas (canvas memory dropped) but the reserved
 * placeholder keeps the scroll height stable. The PDFDocument handle is cached
 * in pdf-cache so re-mounting is fast.
 */
const MOUNT_MARGIN = "1200px 0px";
const UNMOUNT_MARGIN = "4000px 0px";

export function LazyPdfPage({ url, pageIndex, renderWidth, reservedSize, onReady, eager }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState<boolean>(!!eager);
  const [keepCanvas, setKeepCanvas] = useState<boolean>(!!eager);

  useEffect(() => {
    if (eager) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setMounted(true);
      setKeepCanvas(true);
      return;
    }
    const mountObs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          setKeepCanvas(true);
        }
      },
      { rootMargin: MOUNT_MARGIN },
    );
    const farObs = new IntersectionObserver(
      (entries) => {
        // When far off-screen, drop the canvas to reclaim memory.
        const onScreen = entries.some((e) => e.isIntersecting);
        if (!onScreen) setKeepCanvas(false);
        else setKeepCanvas(true);
      },
      { rootMargin: UNMOUNT_MARGIN },
    );
    mountObs.observe(el);
    farObs.observe(el);
    return () => {
      mountObs.disconnect();
      farObs.disconnect();
    };
  }, [eager]);

  const size = reservedSize ?? DEFAULT_RESERVED;
  return (
    <div
      ref={ref}
      style={{
        width: size.width,
        height: size.height,
        maxWidth: "100%",
      }}
      className="relative"
    >
      {mounted && keepCanvas ? (
        <PdfPage url={url} pageIndex={pageIndex} renderWidth={renderWidth} onReady={onReady} />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-muted/30 to-muted/10"
          aria-busy="true"
        >
          <div className="esign-page-skeleton" />
        </div>
      )}
    </div>
  );
}
