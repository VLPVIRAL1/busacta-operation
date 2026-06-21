// Pure helpers for the Auto-Arrange engine on Step 4 of the envelope wizard.
//
// Fields use normalized coordinates: x_pt, y_pt, width_pt, height_pt are
// all fractions of the page (0..1). The page-layout block stores a logical
// "mode" per (page × recipient); when mode = "auto", we recompute positions
// from the sequence on every render and on every save.

export type Orientation = "horizontal" | "vertical";

export type FieldBox = {
  id?: string;
  x_pt: number;
  y_pt: number;
  width_pt: number;
  height_pt: number;
};

export type ComputedBox = {
  x_pt: number;
  y_pt: number;
  width_pt: number;
  height_pt: number;
};

// Default origin: a comfortable bottom-left margin (~72pt on a 612pt-wide page).
// Caller can override via `origin`.
const DEFAULT_ORIGIN_X = 72 / 612; // ~0.1176
const DEFAULT_ORIGIN_Y = 72 / 792; // ~0.0909 (top-anchored)
const DEFAULT_SPACING = 12 / 612; // ~12pt horizontally / vertically

/**
 * Compute the auto-arranged layout for a single (page × recipient) block.
 *
 * Inputs:
 * - `fields` in the order they should appear (caller sorts via sequence).
 * - `orientation` either lays them out left→right or top→bottom.
 * - `origin` is the top-left anchor (fractions of page).
 * - `spacing` is the gap between consecutive boxes (fraction).
 * - Each field keeps its current width/height; we never resize.
 *
 * Output: same array length, each entry contains the new x/y plus the
 * unchanged width/height. Use these to overwrite the persisted field rows.
 */
export function computeAutoLayout(
  fields: FieldBox[],
  opts: {
    orientation: Orientation;
    origin?: { x: number; y: number };
    spacing?: number;
  },
): ComputedBox[] {
  const ox = opts.origin?.x ?? DEFAULT_ORIGIN_X;
  const oy = opts.origin?.y ?? DEFAULT_ORIGIN_Y;
  const gap = opts.spacing ?? DEFAULT_SPACING;

  let cx = ox;
  let cy = oy;

  return fields.map((f) => {
    const box: ComputedBox = {
      x_pt: cx,
      y_pt: cy,
      width_pt: f.width_pt,
      height_pt: f.height_pt,
    };
    if (opts.orientation === "horizontal") {
      cx = clamp01(cx + f.width_pt + gap);
    } else {
      cy = clamp01(cy + f.height_pt + gap);
    }
    return box;
  });
}

/**
 * Suggest a sensible origin from the current centroid of the block so that
 * the first toggle doesn't yank fields to the corner of the page.
 */
export function inferOrigin(fields: FieldBox[]): { x: number; y: number } {
  if (fields.length === 0) {
    return { x: DEFAULT_ORIGIN_X, y: DEFAULT_ORIGIN_Y };
  }
  const minX = Math.min(...fields.map((f) => f.x_pt));
  const minY = Math.min(...fields.map((f) => f.y_pt));
  return { x: clamp01(minX), y: clamp01(minY) };
}

/**
 * Derive a deterministic ordering from current coordinates so an initial
 * toggle preserves the rough visual reading order the user already built.
 */
export function inferSequence<T extends FieldBox & { id?: string }>(
  fields: T[],
  orientation: Orientation,
): T[] {
  const sorted = [...fields];
  if (orientation === "horizontal") {
    sorted.sort((a, b) => a.x_pt - b.x_pt || a.y_pt - b.y_pt);
  } else {
    sorted.sort((a, b) => a.y_pt - b.y_pt || a.x_pt - b.x_pt);
  }
  return sorted;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
