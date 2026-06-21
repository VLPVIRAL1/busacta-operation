import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export interface TourStep {
  ref: RefObject<HTMLElement | null>;
  title: string;
  body: string;
}

interface Props {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

export function DashboardTour({ steps, open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const target = open ? steps[step]?.ref.current : null;

  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      if (!target) {
        setRect(null);
        return;
      }
      const r = target.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
      else if (e.key === "Enter") {
        if (step >= steps.length - 1) onClose();
        else setStep((s) => s + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, steps.length, onClose]);

  useEffect(() => {
    if (open && target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [open, target]);

  if (!open || typeof document === "undefined") return null;

  const current = steps[step];
  if (!current) return null;

  // Position popover below the target, or above if no room.
  const viewportH = window.innerHeight;
  const popoverWidth = 320;
  const popoverHeight = 160;

  const fallback: Rect = { top: viewportH / 2 - 60, left: 16, width: 0, height: 0 };
  const r = rect ?? fallback;

  let popTop = r.top + r.height + 12;
  if (popTop + popoverHeight > viewportH - 16) {
    popTop = Math.max(16, r.top - popoverHeight - 12);
  }
  let popLeft = r.left + r.width / 2 - popoverWidth / 2;
  popLeft = Math.max(16, Math.min(popLeft, window.innerWidth - popoverWidth - 16));

  const isLast = step >= steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog">
      {/* Dimmed backdrop with cut-out hole */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={r.left - PADDING}
                y={r.top - PADDING}
                width={r.width + PADDING * 2}
                height={r.height + PADDING * 2}
                rx="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="black"
          opacity="0.55"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Highlight ring around target */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.25)]"
          style={{
            top: r.top - PADDING,
            left: r.left - PADDING,
            width: r.width + PADDING * 2,
            height: r.height + PADDING * 2,
          }}
        />
      )}

      {/* Popover */}
      <div
        className="absolute rounded-lg border bg-background p-4 shadow-xl"
        style={{ top: popTop, left: popLeft, width: popoverWidth }}
      >
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Step {step + 1} of {steps.length}
        </div>
        <div className="mt-1 text-sm font-semibold">{current.title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{current.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (isLast) onClose();
                else setStep((s) => s + 1);
              }}
            >
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
