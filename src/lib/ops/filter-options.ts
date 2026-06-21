/**
 * Shared option constants for Ops filter bars (Todos, Open Points, Workload).
 * Previously each filter bar re-declared these arrays inline, which let them
 * drift. Keep them here as the single source of truth. All use the
 * `{ value, label }` shape expected by `FacetedMultiChip` / `FacetedSingleChip`.
 */

export type FilterOption = { value: string; label: string };

/** Pipeline "stage head" buckets — mirror `project_pipeline_stages.primary_state`. */
export const STAGE_HEAD_OPTIONS: FilterOption[] = [
  { value: "with_bat", label: "With BAT" },
  { value: "with_cpa", label: "With Client" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
];

/** Default stage heads shown before the user narrows (Open Points). */
export const DEFAULT_STAGE_HEADS = ["with_bat", "with_cpa", "on_hold"];

export const PRIORITY_OPTIONS: FilterOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const COMPLEXITY_OPTIONS: FilterOption[] = [
  { value: "simple", label: "Simple" },
  { value: "medium", label: "Medium" },
  { value: "complex", label: "Complex" },
];

/** Business stream — B2B Firm vs B2C Client work. */
export const STREAM_OPTIONS: FilterOption[] = [
  { value: "cpa", label: "B2B Firm" },
  { value: "direct", label: "B2C Client" },
];
