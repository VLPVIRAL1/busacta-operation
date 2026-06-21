import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, GripVertical } from "lucide-react";
import { cn } from "@/lib/shared/utils";

/**
 * Two-pane layout with a draggable resizer and per-key preference
 * persisted to localStorage. Below `lg` the panes stack vertically and the
 * resizer is hidden (mobile collapse rule).
 *
 * Implemented with a controlled mouse-drag handler (no third-party panel
 * library) so the divider always responds reliably and dragging is fluid.
 */
export function ResizableTwoPane({
  storageKey,
  defaultLeft,
  left,
  right,
  minLeft = 20,
  maxLeft = 85,
  leftToolbar,
  hideToolbar = false,
}: {
  storageKey: string;
  defaultLeft: number;
  left: ReactNode;
  right: ReactNode;
  minLeft?: number;
  maxLeft?: number;
  leftToolbar?: ReactNode;
  hideToolbar?: boolean;
}) {
  const lsKey = `wi-detail-pane:${storageKey}`;
  const [leftPct, setLeftPct] = useState<number>(() => {
    if (typeof window === "undefined") return defaultLeft;
    const saved = window.localStorage.getItem(lsKey);
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n >= minLeft && n <= maxLeft ? n : defaultLeft;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const writeTimer = useRef<number | null>(null);

  const persist = useCallback(
    (next: number) => {
      if (writeTimer.current) window.clearTimeout(writeTimer.current);
      writeTimer.current = window.setTimeout(() => {
        try {
          window.localStorage.setItem(lsKey, String(Math.round(next)));
        } catch {
          /* ignore */
        }
      }, 200);
    },
    [lsKey],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(minLeft, Math.min(maxLeft, pct));
    setLeftPct(clamped);
    persist(clamped);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  useEffect(
    () => () => {
      if (writeTimer.current) window.clearTimeout(writeTimer.current);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [],
  );

  // External nudge: other components can request "wider"/"narrower" via a
  // window event so keyboard shortcuts work without prop drilling.
  useEffect(() => {
    const onNudge = (e: Event) => {
      const detail = (e as CustomEvent<{ storageKey: string; delta: number }>).detail;
      if (!detail || detail.storageKey !== storageKey) return;
      setLeftPct((prev) => {
        const next = Math.max(minLeft, Math.min(maxLeft, prev + detail.delta));
        persist(next);
        return next;
      });
    };
    const onReset = (e: Event) => {
      const detail = (e as CustomEvent<{ storageKey: string }>).detail;
      if (!detail || detail.storageKey !== storageKey) return;
      setLeftPct(defaultLeft);
      try {
        window.localStorage.removeItem(lsKey);
      } catch {
        /* ignore */
      }
    };
    const onSet = (e: Event) => {
      const detail = (e as CustomEvent<{ storageKey: string; value: number }>).detail;
      if (!detail || detail.storageKey !== storageKey) return;
      const next = Math.max(minLeft, Math.min(maxLeft, detail.value));
      setLeftPct(next);
      persist(next);
    };
    window.addEventListener("wi-pane:nudge", onNudge as EventListener);
    window.addEventListener("wi-pane:reset", onReset as EventListener);
    window.addEventListener("wi-pane:set", onSet as EventListener);
    return () => {
      window.removeEventListener("wi-pane:nudge", onNudge as EventListener);
      window.removeEventListener("wi-pane:reset", onReset as EventListener);
      window.removeEventListener("wi-pane:set", onSet as EventListener);
    };
  }, [storageKey, minLeft, maxLeft, persist, defaultLeft, lsKey]);

  const reset = () => {
    setLeftPct(defaultLeft);
    try {
      window.localStorage.removeItem(lsKey);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={cn(hideToolbar ? "flex h-full flex-col min-h-0" : "space-y-2")}>
      {!hideToolbar && (
        <div className="flex items-center gap-2">
          {leftToolbar ? (
            <div className="hidden lg:flex flex-1 min-w-0 items-center gap-2">{leftToolbar}</div>
          ) : (
            <div className="flex-1" />
          )}
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {Math.round(leftPct)}% / {Math.round(100 - leftPct)}%
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-[11px] text-muted-foreground"
            onClick={reset}
            title={`Reset to default (${defaultLeft}% / ${100 - defaultLeft}%)`}
          >
            <RotateCcw className="h-3 w-3" /> Reset width
          </Button>
        </div>
      )}

      {/* Mobile / tablet — stacked, no resizer */}
      <div className="flex flex-col gap-4 lg:hidden">
        <div>{left}</div>
        <div>{right}</div>
      </div>

      {/* lg+ — resizable two-pane */}
      <div
        ref={containerRef}
        className={cn(
          "hidden lg:flex w-full items-stretch rounded-lg select-none",
          hideToolbar ? "flex-1 min-h-0" : "min-h-[400px]",
        )}
      >
        <div style={{ width: `${leftPct}%` }} className="min-w-0 pr-3">
          {left}
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(leftPct)}
          aria-valuemin={minLeft}
          aria-valuemax={maxLeft}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              const n = Math.max(minLeft, leftPct - 2);
              setLeftPct(n);
              persist(n);
            }
            if (e.key === "ArrowRight") {
              const n = Math.min(maxLeft, leftPct + 2);
              setLeftPct(n);
              persist(n);
            }
          }}
          className={cn(
            "group relative flex w-2 cursor-col-resize items-center justify-center",
            "hover:bg-primary/10 active:bg-primary/20 transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-primary/40" />
          <span className="relative z-10 grid h-10 w-3 place-items-center rounded-sm border bg-background shadow-sm">
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </span>
        </div>

        <div style={{ width: `${100 - leftPct}%` }} className="min-w-0 pl-3">
          {right}
        </div>
      </div>
    </div>
  );
}
