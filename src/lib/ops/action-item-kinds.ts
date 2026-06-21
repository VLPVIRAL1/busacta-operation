// Single source of truth for the Clarification & Action Item "kind" taxonomy.
//
// Used by both the task-level panel (task-action-items-panel.tsx, which writes
// task_action_items.kind) and the Clarification & Action Item *template* editor
// (clarification-detail-pane.tsx). Keeping one definition means a new kind only
// has to be added here.

export type ActionItemKind =
  | "open_point"
  | "clarification"
  | "document_needed"
  | "information_required"
  | "confirm"
  | "other";

export const ACTION_ITEM_KINDS: {
  value: ActionItemKind;
  label: string;
  code: string;
  tone: string;
}[] = [
  {
    value: "open_point",
    label: "Open Point",
    code: "OP",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  {
    value: "clarification",
    label: "Clarification",
    code: "CF",
    tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  {
    value: "document_needed",
    label: "Document Required",
    code: "DN",
    tone: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  },
  {
    value: "information_required",
    label: "Information Required",
    code: "IR",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  {
    value: "confirm",
    label: "Confirm",
    code: "CO",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  { value: "other", label: "Other", code: "OT", tone: "bg-muted text-foreground border-border" },
];

export const ACTION_ITEM_KIND_LABEL: Record<ActionItemKind, string> = Object.fromEntries(
  ACTION_ITEM_KINDS.map((k) => [k.value, k.label]),
) as Record<ActionItemKind, string>;
export const ACTION_ITEM_KIND_CODE: Record<ActionItemKind, string> = Object.fromEntries(
  ACTION_ITEM_KINDS.map((k) => [k.value, k.code]),
) as Record<ActionItemKind, string>;
export const ACTION_ITEM_KIND_TONE: Record<ActionItemKind, string> = Object.fromEntries(
  ACTION_ITEM_KINDS.map((k) => [k.value, k.tone]),
) as Record<ActionItemKind, string>;

/** Coerce an arbitrary stored string into a known kind, defaulting to "clarification". */
export function asActionItemKind(value: string | null | undefined): ActionItemKind {
  return ACTION_ITEM_KINDS.some((k) => k.value === value)
    ? (value as ActionItemKind)
    : "clarification";
}
