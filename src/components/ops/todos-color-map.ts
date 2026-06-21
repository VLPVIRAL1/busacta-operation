import { toneChip, type ToneColor } from "@/lib/ui/tone";

/** Map any task value -> chip class (with safe fallback). */
export const stageStateColor: Record<string, ToneColor> = {
  with_bat: "blue",
  with_cpa: "amber",
  on_hold: "slate",
  completed: "emerald",
};
export const stageChip = (primaryState?: string | null) =>
  toneChip(stageStateColor[primaryState ?? ""] ?? "indigo");

export const priorityColor: Record<string, ToneColor> = {
  low: "slate",
  medium: "blue",
  high: "rose",
};
export const priorityChip = (p?: string | null) => toneChip(priorityColor[p ?? ""] ?? "slate");

export const complexityColor: Record<string, ToneColor> = {
  a_hard: "red",
  b_medium: "amber",
  c_easy: "emerald",
};
export const complexityChip = (c?: string | null) => toneChip(complexityColor[c ?? ""] ?? "slate");

export const statusColor: Record<string, ToneColor> = {
  draft: "slate",
  in_progress: "blue",
  review: "violet",
  waiting_client: "amber",
  complete: "emerald",
};
export const statusChip = (s?: string | null) => toneChip(statusColor[s ?? ""] ?? "slate");

export const STAGE_STATE_LABEL: Record<string, string> = {
  with_bat: "With BAT",
  with_cpa: "With CPA",
  on_hold: "On Hold",
  completed: "Completed",
};

export const COMPLEXITY_LABEL: Record<string, string> = {
  a_hard: "A — Hard",
  b_medium: "B — Medium",
  c_easy: "C — Easy",
};

export const periodColor: Record<string, ToneColor> = {
  Monthly: "violet",
  Quarterly: "blue",
  Yearly: "emerald",
  "Ad-hoc": "slate",
};
export const periodChip = (p?: string | null) => toneChip(periodColor[p ?? ""] ?? "slate");

/** Background tone for group-by header bands. Returns a Tailwind class string. */
export function groupHeadingTone(groupKey: string | null, label: string): string {
  if (!groupKey) return "bg-primary/10 text-primary border-l-4 border-primary";
  if (groupKey === "stage_head") {
    const s = Object.entries(STAGE_STATE_LABEL).find(([, v]) => v === label)?.[0] ?? "";
    return stageChip(s) + " border-l-4";
  }
  if (groupKey === "priority") return priorityChip(label.toLowerCase()) + " border-l-4";
  if (groupKey === "complexity") {
    const key = Object.entries(COMPLEXITY_LABEL).find(([, v]) => v === label)?.[0] ?? "";
    return complexityChip(key) + " border-l-4";
  }
  if (groupKey === "period") return periodChip(label) + " border-l-4";
  if (groupKey === "stage") return stageChip(null) + " border-l-4";
  return "bg-primary/10 text-primary border-l-4 border-primary";
}
