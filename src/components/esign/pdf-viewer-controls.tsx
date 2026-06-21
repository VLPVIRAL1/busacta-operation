import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Maximize2,
  Square,
  Magnet,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LazyPdfPage } from "./lazy-pdf-page";
import type { PageSize } from "./pdf-page";

export type ZoomMode = "fit-width" | "fit-page" | "custom";

type PageRefMap = Map<number, HTMLElement | HTMLDivElement | null>;

type Opts = {
  /** The scrolling container that holds the pages. */
  scrollRef: RefObject<HTMLElement | null>;
  /** Per-page DOM refs, keyed by page index. */
  pageRefs: { current: PageRefMap };
  pageCount: number;
  /** Aspect ratio (height / width) of an average page; used for fit-page. */
  pageAspect: number;
  /** Optional global listener guard (e.g. disable when a dialog is open). */
  enabled?: boolean;
  /**
   * When true, scroll/page tracking uses window/viewport instead of
   * scrollRef's internal overflow. Use for routes that let the document
   * itself scroll (e.g. /sign/$token).
   */
  windowScroll?: boolean;
};

/**
 * PDF Reader-style viewer state shared by the e-sign builder and signer.
 * Drives renderWidth, current page tracking, zoom modes, and global keyboard
 * shortcuts (Acrobat / Chrome PDF parity).
 */
export function useEsignPdfViewer(opts: Opts) {
  const { scrollRef, pageRefs, pageCount, pageAspect, enabled = true, windowScroll = false } = opts;

  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Track container size for fit-width / fit-page math.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      if (windowScroll) {
        setContainerSize({
          w: Math.floor(el.getBoundingClientRect().width),
          h: Math.floor(window.innerHeight),
        });
      } else {
        const r = el.getBoundingClientRect();
        setContainerSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (windowScroll) window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      if (windowScroll) window.removeEventListener("resize", measure);
    };
  }, [scrollRef, windowScroll]);

  const fitWidthBase = useMemo(() => {
    if (!containerSize) return 800;
    return Math.max(320, Math.min(1600, containerSize.w - 32));
  }, [containerSize]);

  const fitPageWidth = useMemo(() => {
    if (!containerSize) return fitWidthBase;
    const usableH = Math.max(200, containerSize.h - 48);
    return Math.max(320, Math.min(fitWidthBase, Math.floor(usableH / pageAspect)));
  }, [containerSize, fitWidthBase, pageAspect]);

  const renderWidth = useMemo(() => {
    if (zoomMode === "fit-width") return fitWidthBase;
    if (zoomMode === "fit-page") return fitPageWidth;
    return customWidth ?? fitWidthBase;
  }, [zoomMode, fitWidthBase, fitPageWidth, customWidth]);

  // 100% = fit-width baseline (intuitive for web viewers; matches Chrome PDF).
  const zoomPercent = useMemo(() => {
    if (!fitWidthBase) return 100;
    return Math.round((renderWidth / fitWidthBase) * 100);
  }, [renderWidth, fitWidthBase]);

  const setZoomPercent = useCallback(
    (p: number) => {
      const clamped = Math.max(25, Math.min(400, Math.round(p)));
      setCustomWidth(Math.round(fitWidthBase * (clamped / 100)));
      setZoomMode("custom");
    },
    [fitWidthBase],
  );

  const zoomIn = useCallback(() => setZoomPercent(zoomPercent + 10), [zoomPercent, setZoomPercent]);
  const zoomOut = useCallback(
    () => setZoomPercent(zoomPercent - 10),
    [zoomPercent, setZoomPercent],
  );

  // Track current page from scroll position.
  useEffect(() => {
    if (pageCount === 0) return;
    const root = windowScroll ? null : scrollRef.current;
    if (!windowScroll && !root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        const idx = Number((best.target as HTMLElement).dataset.esignPage);
        if (!Number.isNaN(idx)) setCurrentPage(idx);
      },
      { root, threshold: [0.1, 0.25, 0.5, 0.75] },
    );
    pageRefs.current.forEach((el, idx) => {
      if (!el) return;
      (el as HTMLElement).dataset.esignPage = String(idx);
      obs.observe(el as Element);
    });
    return () => obs.disconnect();
  }, [scrollRef, pageRefs, pageCount, renderWidth, windowScroll]);

  // Track programmatic smooth-scrolls so the snap-to-page debouncer does not
  // immediately re-fire while we're already animating to a page.
  const programmaticUntil = useRef(0);
  const [snapToPages, setSnapToPages] = useState(false);

  const goToPage = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(pageCount - 1, idx));
      const el = pageRefs.current.get(clamped);
      if (el) {
        programmaticUntil.current = Date.now() + 700;
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
        setCurrentPage(clamped);
      }
    },
    [pageCount, pageRefs],
  );

  const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
  const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);

  // Snap-to-page: after the user stops scrolling, smoothly align the nearest
  // page to the viewport top. Disabled by default; toggle from toolbar.
  useEffect(() => {
    if (!snapToPages || pageCount === 0) return;
    const target: Window | HTMLElement | null = windowScroll ? window : scrollRef.current;
    if (!target) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        if (Date.now() < programmaticUntil.current) return;
        // Find page whose top is nearest to the viewport top.
        const refTop = windowScroll ? 0 : (scrollRef.current?.getBoundingClientRect().top ?? 0);
        let bestIdx = -1;
        let bestDist = Infinity;
        pageRefs.current.forEach((el, idx) => {
          if (!el) return;
          const r = (el as HTMLElement).getBoundingClientRect();
          const d = Math.abs(r.top - refTop);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = idx;
          }
        });
        // Only snap if the nearest page is meaningfully off-top (>16px) and
        // closer than ~40% of its own height to avoid yanking mid-page reads.
        if (bestIdx >= 0 && bestDist > 16) {
          const el = pageRefs.current.get(bestIdx);
          const h = el ? (el as HTMLElement).getBoundingClientRect().height : 0;
          if (h === 0 || bestDist < h * 0.4) goToPage(bestIdx);
        }
      }, 140);
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (t) clearTimeout(t);
    };
  }, [snapToPages, pageCount, scrollRef, pageRefs, windowScroll, goToPage]);

  const scrollBy = useCallback(
    (dy: number) => {
      if (windowScroll) {
        window.scrollBy({ top: dy, behavior: "smooth" });
      } else {
        scrollRef.current?.scrollBy({ top: dy, behavior: "smooth" });
      }
    },
    [scrollRef, windowScroll],
  );

  // Global keyboard shortcuts.
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      // Respect handlers that already consumed the event (e.g. field-level
      // arrow navigation on the signer page).
      if (e.defaultPrevented) return;
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      const editable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt?.isContentEditable;
      const meta = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd-driven shortcuts (work even in inputs, except Ctrl+G prompt).
      if (meta) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomIn();
          return;
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          zoomOut();
          return;
        }
        if (e.key === "0") {
          e.preventDefault();
          setZoomMode("fit-width");
          return;
        }
        if (e.key === "1") {
          e.preventDefault();
          setZoomPercent(100);
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          setZoomMode("fit-page");
          return;
        }
        if (e.key.toLowerCase() === "g" && !editable) {
          e.preventDefault();
          const p = window.prompt(`Go to page (1–${pageCount})`, String(currentPage + 1));
          if (p) {
            const n = parseInt(p, 10);
            if (!Number.isNaN(n)) goToPage(n - 1);
          }
          return;
        }
        if (e.key === "Home") {
          e.preventDefault();
          goToPage(0);
          return;
        }
        if (e.key === "End") {
          e.preventDefault();
          goToPage(pageCount - 1);
          return;
        }
      }

      if (editable) return;

      if (e.key === "PageDown" || (e.key === " " && !e.shiftKey) || e.key === "j") {
        e.preventDefault();
        nextPage();
        return;
      }
      if (e.key === "PageUp" || (e.key === " " && e.shiftKey) || e.key === "k") {
        e.preventDefault();
        prevPage();
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        goToPage(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        goToPage(pageCount - 1);
        return;
      }
      // Bare ArrowDown/Up scroll the viewport (Acrobat parity).
      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollBy(120);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollBy(-120);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        setZoomMode("fit-width");
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    enabled,
    zoomIn,
    zoomOut,
    setZoomPercent,
    setZoomMode,
    nextPage,
    prevPage,
    goToPage,
    scrollBy,
    pageCount,
    currentPage,
  ]);

  return {
    renderWidth,
    currentPage,
    zoomMode,
    zoomPercent,
    setZoomMode,
    setZoomPercent,
    zoomIn,
    zoomOut,
    goToPage,
    nextPage,
    prevPage,
    snapToPages,
    setSnapToPages,
  };
}

export type EsignPdfViewer = ReturnType<typeof useEsignPdfViewer>;

export function EsignPdfViewerToolbar({
  viewer,
  pageCount,
  trailing,
  className,
}: {
  viewer: EsignPdfViewer;
  pageCount: number;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const [pageInput, setPageInput] = useState(String(viewer.currentPage + 1));
  useEffect(() => {
    setPageInput(String(viewer.currentPage + 1));
  }, [viewer.currentPage]);

  function commitPage() {
    const n = parseInt(pageInput, 10);
    if (!Number.isNaN(n)) viewer.goToPage(n - 1);
    else setPageInput(String(viewer.currentPage + 1));
  }

  return (
    <div
      className={"flex items-center gap-1 text-xs flex-wrap " + (className ?? "")}
      role="toolbar"
      aria-label="PDF viewer controls"
    >
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={viewer.prevPage}
        disabled={viewer.currentPage <= 0}
        title="Previous page (PageUp / k)"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Input
        value={pageInput}
        onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitPage();
          }
        }}
        onBlur={commitPage}
        className="h-7 w-12 text-center px-1"
        aria-label="Page number"
        title="Page (Ctrl+G to jump)"
      />
      <span className="text-muted-foreground tabular-nums">/ {pageCount}</span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={viewer.nextPage}
        disabled={viewer.currentPage >= pageCount - 1}
        title="Next page (PageDown / Space / j)"
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-4 w-px bg-border" aria-hidden />

      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={viewer.zoomOut}
        title="Zoom out (Ctrl −)"
        aria-label="Zoom out"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <span
        className="tabular-nums text-muted-foreground min-w-[3rem] text-center"
        title="Current zoom"
      >
        {viewer.zoomPercent}%
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={viewer.zoomIn}
        title="Zoom in (Ctrl +)"
        aria-label="Zoom in"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-4 w-px bg-border" aria-hidden />

      <Button
        size="sm"
        variant={viewer.zoomMode === "fit-width" ? "secondary" : "ghost"}
        className="h-7 px-2"
        onClick={() => viewer.setZoomMode("fit-width")}
        title="Fit width (Ctrl 0)"
        aria-pressed={viewer.zoomMode === "fit-width"}
      >
        <Maximize2 className="h-3.5 w-3.5 mr-1" />
        Fit W
      </Button>
      <Button
        size="sm"
        variant={viewer.zoomMode === "fit-page" ? "secondary" : "ghost"}
        className="h-7 px-2"
        onClick={() => viewer.setZoomMode("fit-page")}
        title="Fit page (Ctrl 2)"
        aria-pressed={viewer.zoomMode === "fit-page"}
      >
        <Square className="h-3.5 w-3.5 mr-1" />
        Fit P
      </Button>
      <Button
        size="sm"
        variant={viewer.zoomPercent === 100 && viewer.zoomMode === "custom" ? "secondary" : "ghost"}
        className="h-7 px-2"
        onClick={() => viewer.setZoomPercent(100)}
        title="Reset zoom to 100% (Ctrl 1)"
      >
        100%
      </Button>

      <div className="mx-1 h-4 w-px bg-border" aria-hidden />

      <Button
        size="icon"
        variant={viewer.snapToPages ? "secondary" : "ghost"}
        className="h-7 w-7"
        onClick={() => viewer.setSnapToPages(!viewer.snapToPages)}
        title={
          viewer.snapToPages
            ? "Snap-to-page: on (scrolling settles to nearest page)"
            : "Snap-to-page: off"
        }
        aria-pressed={viewer.snapToPages}
        aria-label="Toggle snap to page"
      >
        <Magnet className="h-4 w-4" />
      </Button>

      {trailing && (
        <>
          <div className="mx-1 h-4 w-px bg-border" aria-hidden />
          {trailing}
        </>
      )}
    </div>
  );
}

/** Shared list of shortcut rows for the help dialog. */
export const PDF_VIEWER_SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["PageDn", "Space", "j"], label: "Next page" },
  { keys: ["PageUp", "Shift+Space", "k"], label: "Previous page" },
  { keys: ["Home"], label: "Jump to first page" },
  { keys: ["End"], label: "Jump to last page" },
  { keys: ["↓", "↑"], label: "Scroll down / up" },
  { keys: ["Ctrl +", "Ctrl −"], label: "Zoom in / out" },
  { keys: ["Ctrl 0"], label: "Fit width" },
  { keys: ["Ctrl 1"], label: "Reset to 100%" },
  { keys: ["Ctrl 2"], label: "Fit page" },
  { keys: ["Ctrl G"], label: "Go to page…" },
  { keys: ["T"], label: "Toggle thumbnails sidebar" },
];

/**
 * Vertical thumbnail rail. Renders one small <LazyPdfPage> per page, clickable
 * to jump via `viewer.goToPage`. The current page is highlighted, and the rail
 * auto-scrolls so the active thumbnail stays in view. Use alongside the main
 * continuous scroll area to give DocuSign/Acrobat-style fast page navigation.
 */
export function PageThumbnailRail({
  url,
  pageCount,
  pageSizes,
  viewer,
  width = 132,
  className,
}: {
  url: string | null;
  pageCount: number;
  pageSizes: Record<number, PageSize>;
  viewer: EsignPdfViewer;
  width?: number;
  className?: string;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const thumbW = Math.max(80, Math.min(220, width - 24));

  // Estimated row height: thumbnail + label + gap. Use first known page aspect.
  const firstSize = pageSizes[0] ?? { width: 612, height: 792 };
  const estimatedRowHeight =
    Math.round(thumbW * (firstSize.height / firstSize.width || 1.294)) + 22;

  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => railRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 4,
  });

  // Keep the active thumb visible inside the rail by scrolling the virtualizer.
  useEffect(() => {
    if (pageCount === 0) return;
    virtualizer.scrollToIndex(viewer.currentPage, { align: "center", behavior: "smooth" });
  }, [viewer.currentPage, pageCount, virtualizer]);

  const [goInput, setGoInput] = useState("");
  function commitGo() {
    const n = parseInt(goInput, 10);
    if (!Number.isNaN(n)) viewer.goToPage(n - 1);
    setGoInput("");
  }

  if (!url || pageCount === 0) {
    return <aside className={"border-r bg-muted/30 " + (className ?? "")} style={{ width }} />;
  }

  const items = virtualizer.getVirtualItems();

  return (
    <aside
      className={"border-r bg-muted/30 flex flex-col " + (className ?? "")}
      style={{ width }}
      aria-label="Page thumbnails"
    >
      <div className="p-2 border-b bg-background/60 flex items-center gap-1">
        <Input
          value={goInput}
          onChange={(e) => setGoInput(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitGo();
            }
          }}
          onBlur={() => goInput && commitGo()}
          placeholder={`Go to (1–${pageCount})`}
          className="h-7 text-xs px-2"
          aria-label="Go to page"
          title="Type a page number and press Enter"
        />
      </div>
      <div ref={railRef} className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {items.map((vi) => {
            const i = vi.index;
            const size = pageSizes[i] ?? pageSizes[0] ?? { width: 612, height: 792 };
            const aspect = size.height / size.width || 1.294;
            const reserved = { width: thumbW, height: Math.round(thumbW * aspect) };
            const isCurrent = i === viewer.currentPage;
            return (
              <div
                key={vi.key}
                data-index={i}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
                className="flex flex-col items-center gap-0.5 pb-2"
              >
                <button
                  type="button"
                  onClick={() => viewer.goToPage(i)}
                  title={`Go to page ${i + 1}`}
                  aria-label={`Go to page ${i + 1}`}
                  aria-current={isCurrent ? "page" : undefined}
                  className={
                    "relative block rounded-md overflow-hidden bg-white shadow-sm transition-all " +
                    (isCurrent
                      ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                      : "hover:ring-1 hover:ring-border")
                  }
                  style={{ width: reserved.width }}
                >
                  <div style={{ width: reserved.width, height: reserved.height }}>
                    <LazyPdfPage
                      url={url}
                      pageIndex={i}
                      renderWidth={thumbW}
                      reservedSize={reserved}
                    />
                  </div>
                </button>
                <span
                  className={
                    "text-[10px] tabular-nums " +
                    (isCurrent ? "text-foreground font-medium" : "text-muted-foreground")
                  }
                >
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

/**
 * Standalone toggle button for the thumbnail rail. Place in the viewer
 * toolbar. Pairs with `T` keyboard shortcut wired by the parent.
 */
export function ThumbnailToggleButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      size="icon"
      variant={open ? "secondary" : "ghost"}
      className="h-7 w-7"
      onClick={onToggle}
      title={open ? "Hide thumbnails (T)" : "Show thumbnails (T)"}
      aria-pressed={open}
      aria-label="Toggle thumbnails"
    >
      {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
    </Button>
  );
}
