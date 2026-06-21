/**
 * Central surface + typography utility classes.
 *
 * Single source of truth for layered dark-mode-aware surfaces. Use these
 * instead of hardcoding `bg-card`, `bg-white/40`, or color classes so the
 * whole app honors the theme tokens (see src/styles.css).
 *
 * Re-exports the existing tone helpers so components have one import.
 */

export const SURFACE = {
  /** Layer 0 — app canvas */
  canvas: "bg-background text-foreground",
  /** Layer 1 — cards, panels */
  card: "surface-1 hairline",
  /** Layer 1 raised — popovers, dropdowns, dialogs */
  raised: "surface-raised hairline shadow-[var(--shadow-elegant)]",
  /** Layer 2 — inputs, row hover */
  sunken: "surface-2",
  /** Translucent glass — auto dark-aware via styles.css */
  glass: "glass",
} as const;

export const TEXT = {
  strong: "text-strong",
  soft: "text-soft",
  mutedStrong: "text-muted-strong",
} as const;

export const BORDER = {
  subtle: "border border-[var(--border-subtle)]",
  strong: "border border-[var(--border-strong)]",
} as const;

export const KPI = {
  positive: "kpi-positive font-semibold",
  negative: "kpi-negative font-semibold",
  neutral: "kpi-neutral font-semibold",
} as const;

export { toneChip, toneAlert, toneSolid, toneMetric } from "@/lib/ui/tone";
export type { ToneColor } from "@/lib/ui/tone";
