/**
 * WCAG AA contrast audit for dark + light theme tokens.
 *
 * Parses oklch() literals from src/styles.css and asserts ratios meet:
 *   - normal text: >= 4.5:1
 *   - large text / borders: >= 3:1
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../../../styles.css"), "utf8");

// --- minimal oklch -> linear sRGB -> luminance ---
function oklchToLinearRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = Math.cos(h) * C;
  const b = Math.sin(h) * C;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function relLuminance(L: number, C: number, h: number): number {
  const [r, g, b] = oklchToLinearRgb(L, C, h);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const lf = relLuminance(...fg);
  const lb = relLuminance(...bg);
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pull `--name: oklch(L C H[ /A])` from a CSS block. */
function extractTokens(block: string): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  const re = /--([a-z0-9-]+):\s*oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/gi;
  let m;
  while ((m = re.exec(block))) {
    out[m[1]] = [parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
  }
  return out;
}

const darkStart = css.indexOf(".dark {");
const lightBlock = css.slice(css.indexOf(":root"), darkStart);
const darkBlock = css.slice(darkStart);

const light = extractTokens(lightBlock);
// Dark inherits any unset token from light (CSS cascade).
const dark = { ...light, ...extractTokens(darkBlock) };

describe("dark mode WCAG AA contrast", () => {
  it("foreground vs background", () => {
    expect(contrast(dark.foreground, dark.background)).toBeGreaterThanOrEqual(7);
  });
  it("foreground vs card", () => {
    expect(contrast(dark.foreground, dark.card)).toBeGreaterThanOrEqual(7);
  });
  it("muted-foreground vs card (body text AA)", () => {
    expect(contrast(dark["muted-foreground"], dark.card)).toBeGreaterThanOrEqual(4.5);
  });
  it("muted-foreground vs background (body text AA)", () => {
    expect(contrast(dark["muted-foreground"], dark.background)).toBeGreaterThanOrEqual(4.5);
  });
  it("text-strong vs card", () => {
    expect(contrast(dark["text-strong"], dark.card)).toBeGreaterThanOrEqual(7);
  });
  it("text-muted-strong vs card", () => {
    expect(contrast(dark["text-muted-strong"], dark.card)).toBeGreaterThanOrEqual(4.5);
  });
  it("sidebar-foreground vs sidebar", () => {
    expect(contrast(dark["sidebar-foreground"], dark.sidebar)).toBeGreaterThanOrEqual(7);
  });
});

describe("light mode WCAG AA contrast", () => {
  it("foreground vs background", () => {
    expect(contrast(light.foreground, light.background)).toBeGreaterThanOrEqual(7);
  });
  it("muted-foreground vs card", () => {
    expect(contrast(light["muted-foreground"], light.card)).toBeGreaterThanOrEqual(4.5);
  });
  it("text-strong vs card", () => {
    expect(contrast(light["text-strong"], light.card)).toBeGreaterThanOrEqual(7);
  });
});

/** Adjust oklch L for a CSS `filter: brightness(k)` (approximate). */
function brighten(c: [number, number, number], k: number): [number, number, number] {
  return [Math.min(1, c[0] * k), c[1], c[2]];
}

/** Composite a foreground oklch over a background oklch at given alpha. */
function alphaOver(
  fg: [number, number, number],
  bg: [number, number, number],
  alpha: number,
): [number, number, number] {
  // Linear-space mix on L (good enough for AA ratio assertions).
  return [fg[0] * alpha + bg[0] * (1 - alpha), fg[1], fg[2]];
}

describe.each([
  ["dark", dark],
  ["light", light],
] as const)("%s mode — chart colors (WCAG 1.4.11 non-text ≥ 3:1)", (_label, t) => {
  for (const key of ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const) {
    it(`${key} vs background`, () => {
      expect(contrast(t[key], t.background)).toBeGreaterThanOrEqual(3);
    });
    it(`${key} vs card`, () => {
      expect(contrast(t[key], t.card)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe.each([
  ["dark", dark],
  ["light", light],
] as const)("%s mode — link / primary surfaces", (_label, t) => {
  it("primary vs background (link text AA)", () => {
    expect(contrast(t.primary, t.background)).toBeGreaterThanOrEqual(4.5);
  });
  it("accent-foreground vs accent (focused chips)", () => {
    expect(contrast(t["accent-foreground"], t.accent)).toBeGreaterThanOrEqual(4.5);
  });
  it("ring vs background (focus ring ≥ 3:1)", () => {
    expect(contrast(t.ring, t.background)).toBeGreaterThanOrEqual(3);
  });
});

describe.each([
  ["dark", dark],
  ["light", light],
] as const)("%s mode — shadcn interactive states", (_label, t) => {
  it("default Button — primary-fg on primary", () => {
    expect(contrast(t["primary-foreground"], t.primary)).toBeGreaterThanOrEqual(4.5);
  });
  it("secondary Button — secondary-fg on secondary", () => {
    expect(contrast(t["secondary-foreground"], t.secondary)).toBeGreaterThanOrEqual(4.5);
  });
  it("destructive Button — destructive-fg on destructive", () => {
    expect(contrast(t["destructive-foreground"], t.destructive)).toBeGreaterThanOrEqual(4.5);
  });
  it("Button hover (filter:brightness(1.04)) preserves AA", () => {
    expect(contrast(t["primary-foreground"], brighten(t.primary, 1.04))).toBeGreaterThanOrEqual(
      4.5,
    );
  });
  it("Input placeholder — muted-fg on secondary (input bg)", () => {
    expect(contrast(t["muted-foreground"], t.secondary)).toBeGreaterThanOrEqual(4.5);
  });
  it("disabled (opacity 0.5) foreground over card ≥ 3:1 (large text)", () => {
    const ghosted = alphaOver(t.foreground, t.card, 0.5);
    expect(contrast(ghosted, t.card)).toBeGreaterThanOrEqual(3);
  });
});
