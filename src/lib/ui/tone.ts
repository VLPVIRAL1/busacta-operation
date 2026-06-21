/**
 * Theme-aware status/badge color helpers.
 * Use these instead of raw `bg-X-100 text-X-700` so dark mode stays readable.
 *
 * toneChip: soft pastel chip on light, translucent tint on dark
 * toneSolid: solid color block (works in both modes — used for emphatic badges)
 * toneAlert: alert/info card (border + soft fill)
 */

export type ToneColor =
  | "slate"
  | "blue"
  | "sky"
  | "amber"
  | "rose"
  | "red"
  | "emerald"
  | "green"
  | "indigo"
  | "violet";

const CHIP: Record<ToneColor, string> = {
  slate:
    "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-500/30",
  blue: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/30",
  sky: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/30",
  amber:
    "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30",
  rose: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30",
  red: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30",
  emerald:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
  green:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/15 dark:text-green-200 dark:border-green-500/30",
  indigo:
    "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-500/30",
  violet:
    "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-500/30",
};

const ALERT: Record<ToneColor, string> = {
  slate:
    "border border-slate-200 bg-slate-50 text-slate-900 dark:bg-slate-500/10 dark:text-slate-100 dark:border-slate-500/30",
  blue: "border border-blue-200 bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100 dark:border-blue-500/30",
  sky: "border border-sky-200 bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-100 dark:border-sky-500/30",
  amber:
    "border border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/30",
  rose: "border border-rose-200 bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100 dark:border-rose-500/30",
  red: "border border-red-200 bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-100 dark:border-red-500/30",
  emerald:
    "border border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/30",
  green:
    "border border-green-200 bg-green-50 text-green-900 dark:bg-green-500/10 dark:text-green-100 dark:border-green-500/30",
  indigo:
    "border border-indigo-200 bg-indigo-50 text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-100 dark:border-indigo-500/30",
  violet:
    "border border-violet-200 bg-violet-50 text-violet-900 dark:bg-violet-500/10 dark:text-violet-100 dark:border-violet-500/30",
};

const SOLID: Record<ToneColor, string> = {
  slate: "bg-slate-500 text-white dark:bg-slate-500/80",
  blue: "bg-blue-500 text-white dark:bg-blue-500/80",
  sky: "bg-sky-500 text-white dark:bg-sky-500/80",
  amber: "bg-amber-500 text-white dark:bg-amber-500/80",
  rose: "bg-rose-500 text-white dark:bg-rose-500/80",
  red: "bg-red-500 text-white dark:bg-red-500/80",
  emerald: "bg-emerald-500 text-white dark:bg-emerald-500/80",
  green: "bg-green-600 text-white dark:bg-green-500/80",
  indigo: "bg-indigo-500 text-white dark:bg-indigo-500/80",
  violet: "bg-violet-500 text-white dark:bg-violet-500/80",
};

export const toneChip = (c: ToneColor) => CHIP[c];
export const toneAlert = (c: ToneColor) => ALERT[c];
export const toneSolid = (c: ToneColor) => SOLID[c];

const TONE_COLORS: ReadonlySet<string> = new Set(Object.keys(CHIP));

/**
 * Coerce an arbitrary stored value (e.g. `project_pipeline_stages.color`, which
 * may hold a tone key OR a raw CSS hex) into a known {@link ToneColor}.
 * Non-tone values (hex, null) fall back to `fallback`.
 */
export const asToneColor = (
  value: string | null | undefined,
  fallback: ToneColor = "slate",
): ToneColor => (value && TONE_COLORS.has(value) ? (value as ToneColor) : fallback);

/**
 * toneMetric: vibrant numeric color for KPI / currency indicators.
 * Dark mode uses brighter -400 shades so figures pop off Layer-1 surfaces.
 */
const METRIC: Record<ToneColor, string> = {
  slate: "text-slate-700 dark:text-slate-300",
  blue: "text-blue-600 dark:text-blue-400",
  sky: "text-sky-600 dark:text-sky-400",
  amber: "text-amber-600 dark:text-amber-300",
  rose: "text-rose-600 dark:text-rose-400",
  red: "text-red-600 dark:text-rose-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  green: "text-green-600 dark:text-emerald-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  violet: "text-violet-600 dark:text-violet-400",
};

export const toneMetric = (c: ToneColor) => METRIC[c];
