import type { Database } from "@/integrations/supabase/types";

export type SoftwareType = Database["public"]["Enums"]["software_type"];
export type TemplateType = Database["public"]["Enums"]["template_type"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type EntityType = Database["public"]["Enums"]["entity_type"];
export type ProjectType =
  | "accounting"
  | "auditing"
  | "tax_preparation"
  | "sales_tax"
  | "company_formation"
  | "payroll_processing"
  | "other";

/**
 * Default value for the `Skip Client Entity layer` toggle when a new project
 * of the given type is created. Tax Preparation flattens Project → Task; all
 * other types use the Project → Entity → Task hierarchy.
 *
 * The DB trigger `seed_default_project_setup` is the source of truth; this
 * helper exists so the Firm Hub create-project form matches what will be
 * saved server-side.
 */
export function defaultSkipEntityForProjectType(type: ProjectType): boolean {
  return type === "tax_preparation";
}

/**
 * Internal name used to mark the synthetic per-project default entity row that
 * carries tasks for projects that "skip" the Client Entity hierarchy. Hidden
 * from any UI that displays entity names to humans.
 */
export const HIDDEN_DEFAULT_ENTITY_NAME = "__project_default";

/**
 * User-facing display name for a Client Entity. The internal sentinel name
 * `__project_default` (carrying tasks for projects that skip the entity
 * hierarchy) is replaced with the friendly label "Project tasks". Use this
 * anywhere an entity name is rendered to a human — breadcrumbs, headers,
 * group titles, tooltips.
 */
export function formatEntityDisplayName(name: string | null | undefined): string {
  if (!name) return "—";
  if (name === HIDDEN_DEFAULT_ENTITY_NAME) return "Project tasks";
  return name;
}

/**
 * Convenience predicate for the synthetic per-project default entity.
 */
export function isHiddenDefaultEntity(name: string | null | undefined): boolean {
  return name === HIDDEN_DEFAULT_ENTITY_NAME;
}

export type EntityRequirementResult = { ok: true } | { ok: false; reason: "entity_required" };

/**
 * Validates whether a task can be submitted given the project's entity-layer
 * configuration. When the project does NOT skip the entity hierarchy, the
 * caller MUST provide a real entity id (not "none" / undefined).
 */
export function validateTaskEntityRequirement(input: {
  skipEntity: boolean;
  entityId?: string | null;
}): EntityRequirementResult {
  if (input.skipEntity) return { ok: true };
  const id = input.entityId;
  if (!id || id === "none") return { ok: false, reason: "entity_required" };
  return { ok: true };
}

export const SOFTWARE_OPTIONS: { value: SoftwareType; label: string }[] = [
  { value: "lacerte", label: "Lacerte" },
  { value: "drake", label: "Drake" },
  { value: "cch_axcess", label: "CCH Axcess" },
  { value: "ultratax", label: "UltraTax" },
  { value: "proconnect", label: "ProConnect" },
  { value: "other", label: "Other" },
];

export const TEMPLATE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: "none", label: "No template" },
  { value: "form_1065", label: "Form 1065 — Partnership" },
  { value: "form_1120s", label: "Form 1120-S — S-Corp" },
  { value: "form_1120", label: "Form 1120 — C-Corp" },
  { value: "form_1040", label: "Form 1040 — Individual" },
];

export const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "individual", label: "Individual" },
  { value: "business", label: "Business" },
];

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string; tone: string }[] = [
  { value: "draft", label: "Draft", tone: "bg-muted text-muted-foreground" },
  {
    value: "in_progress",
    label: "In Progress",
    tone: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  {
    value: "review",
    label: "Ready for Review",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    value: "waiting_client",
    label: "Waiting for Client",
    tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  {
    value: "complete",
    label: "Complete",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
];

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string; tone: string }[] = [
  { value: "low", label: "Low", tone: "text-muted-foreground" },
  { value: "medium", label: "Medium", tone: "text-blue-600 dark:text-blue-300" },
  { value: "high", label: "High", tone: "text-rose-600 dark:text-rose-300" },
];

export const TASK_COMPLEXITY_OPTIONS: {
  value: "a_hard" | "b_medium" | "c_easy";
  label: string;
  tone: string;
}[] = [
  { value: "a_hard", label: "A — Hard", tone: "text-rose-600 dark:text-rose-300" },
  { value: "b_medium", label: "B — Medium", tone: "text-amber-600 dark:text-amber-300" },
  { value: "c_easy", label: "C — Easy", tone: "text-emerald-600 dark:text-emerald-300" },
];

export const PROJECT_TYPE_OPTIONS: { value: ProjectType; label: string; tone: string }[] = [
  {
    value: "accounting",
    label: "Accounting",
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
  {
    value: "auditing",
    label: "Auditing",
    tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
  {
    value: "tax_preparation",
    label: "Tax Preparation",
    tone: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  {
    value: "sales_tax",
    label: "Sales Tax",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    value: "company_formation",
    label: "Company Formation",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  {
    value: "payroll_processing",
    label: "Payroll Processing",
    tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  { value: "other", label: "Other", tone: "bg-muted text-muted-foreground" },
];

export const US_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (EST/EDT)" },
  { value: "America/Chicago", label: "Central (CST/CDT)" },
  { value: "America/Denver", label: "Mountain (MST/MDT)" },
  { value: "America/Phoenix", label: "Mountain — Arizona (MST)" },
  { value: "America/Los_Angeles", label: "Pacific (PST/PDT)" },
  { value: "America/Anchorage", label: "Alaska (AKST/AKDT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
];

export const ACCOUNTING_SOFTWARE_OPTIONS: string[] = [
  "QuickBooks Online",
  "QuickBooks Desktop",
  "Xero",
  "Sage Intacct",
  "NetSuite",
  "FreshBooks",
  "Wave",
  "Zoho Books",
  "Bill.com",
  "Other",
];

export const TAX_SOFTWARE_OPTIONS: string[] = [
  "Lacerte",
  "Drake",
  "CCH Axcess",
  "UltraTax",
  "ProConnect",
  "ProSeries",
  "TaxAct Professional",
  "ATX",
  "Other",
];

export const PM_SOFTWARE_OPTIONS: string[] = [
  "TaxDome",
  "Karbon",
  "Canopy",
  "Jetpack Workflow",
  "Asana",
  "ClickUp",
  "Monday.com",
  "Trello",
  "Notion",
  "Other",
];

export const labelFor = <T extends string>(
  opts: { value: T; label: string }[],
  v: T | null | undefined,
) => opts.find((o) => o.value === v)?.label ?? "—";
