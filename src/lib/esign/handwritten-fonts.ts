/**
 * Curated handwritten Google Fonts for the e-signature "Type" tab.
 * Loaded on-demand the first time the signature pad opens so we don't
 * tax the rest of the app.
 *
 * Each entry maps the user-facing label to the exact CSS `font-family`
 * the browser will resolve once the Google Fonts <link> is injected.
 */

export type HandwrittenFont = {
  /** UI label shown in the picker. */
  label: string;
  /** Exact CSS font-family value (single name, quoted). */
  family: string;
  /** Google Fonts URL fragment, e.g. "Caveat:wght@400;700". */
  googleSpec: string;
  /** Suggested rendering size for the offscreen PNG (px). */
  renderSize: number;
};

export const HANDWRITTEN_FONTS: HandwrittenFont[] = [
  { label: "Caveat", family: "'Caveat'", googleSpec: "Caveat:wght@500;700", renderSize: 64 },
  {
    label: "Dancing Script",
    family: "'Dancing Script'",
    googleSpec: "Dancing+Script:wght@500;700",
    renderSize: 60,
  },
  { label: "Sacramento", family: "'Sacramento'", googleSpec: "Sacramento", renderSize: 60 },
  { label: "Great Vibes", family: "'Great Vibes'", googleSpec: "Great+Vibes", renderSize: 60 },
  { label: "Allura", family: "'Allura'", googleSpec: "Allura", renderSize: 64 },
  { label: "Pacifico", family: "'Pacifico'", googleSpec: "Pacifico", renderSize: 52 },
  { label: "Satisfy", family: "'Satisfy'", googleSpec: "Satisfy", renderSize: 58 },
  {
    label: "Kaushan Script",
    family: "'Kaushan Script'",
    googleSpec: "Kaushan+Script",
    renderSize: 54,
  },
  {
    label: "Homemade Apple",
    family: "'Homemade Apple'",
    googleSpec: "Homemade+Apple",
    renderSize: 44,
  },
  {
    label: "La Belle Aurore",
    family: "'La Belle Aurore'",
    googleSpec: "La+Belle+Aurore",
    renderSize: 52,
  },
  { label: "Cookie", family: "'Cookie'", googleSpec: "Cookie", renderSize: 64 },
  { label: "Yellowtail", family: "'Yellowtail'", googleSpec: "Yellowtail", renderSize: 58 },
  { label: "Parisienne", family: "'Parisienne'", googleSpec: "Parisienne", renderSize: 60 },
  { label: "Mr Dafoe", family: "'Mr Dafoe'", googleSpec: "Mr+Dafoe", renderSize: 64 },
  {
    label: "Mrs Saint Delafield",
    family: "'Mrs Saint Delafield'",
    googleSpec: "Mrs+Saint+Delafield",
    renderSize: 64,
  },
];

let loaded = false;

/**
 * Inject the Google Fonts <link> once. Safe to call repeatedly.
 * No-op during SSR.
 */
export function ensureHandwrittenFontsLoaded(): void {
  if (loaded) return;
  if (typeof document === "undefined") return;
  const families = HANDWRITTEN_FONTS.map((f) => `family=${f.googleSpec}`).join("&");
  const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-esign-handwritten", "true");
  document.head.appendChild(link);
  loaded = true;
}
