// Shared colour palette for Daily Notes and personal reminders.
// Stored as a stable key (e.g. "amber") in the `color` column; mapped here to
// Tailwind classes so light/dark theming stays consistent. Class strings are
// kept as literals so the Tailwind 4 scanner emits them.

export type NoteColorKey = "default" | "rose" | "amber" | "green" | "sky" | "violet" | "slate";

export type NoteColor = {
  key: NoteColorKey;
  label: string;
  /** Solid dot used in the picker. */
  swatch: string;
  /** Thin accent bar / left rail. */
  bar: string;
  /** Card surface + border tint. */
  tile: string;
};

export const NOTE_COLORS: NoteColor[] = [
  {
    key: "default",
    label: "Default",
    swatch: "bg-slate-300 dark:bg-slate-600",
    bar: "bg-transparent",
    tile: "bg-card border-border",
  },
  {
    key: "rose",
    label: "Rose",
    swatch: "bg-rose-400",
    bar: "bg-rose-400",
    tile: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50",
  },
  {
    key: "amber",
    label: "Amber",
    swatch: "bg-amber-400",
    bar: "bg-amber-400",
    tile: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50",
  },
  {
    key: "green",
    label: "Green",
    swatch: "bg-emerald-400",
    bar: "bg-emerald-400",
    tile: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50",
  },
  {
    key: "sky",
    label: "Sky",
    swatch: "bg-sky-400",
    bar: "bg-sky-400",
    tile: "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-900/50",
  },
  {
    key: "violet",
    label: "Violet",
    swatch: "bg-violet-400",
    bar: "bg-violet-400",
    tile: "bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-900/50",
  },
  {
    key: "slate",
    label: "Slate",
    swatch: "bg-slate-400",
    bar: "bg-slate-400",
    tile: "bg-slate-100 border-slate-300 dark:bg-slate-800/50 dark:border-slate-700",
  },
];

const BY_KEY: Record<string, NoteColor> = Object.fromEntries(NOTE_COLORS.map((c) => [c.key, c]));

/** Resolve a stored colour key (or null) to its palette entry, falling back to default. */
export function noteColor(key: string | null | undefined): NoteColor {
  return BY_KEY[key ?? "default"] ?? BY_KEY.default;
}
