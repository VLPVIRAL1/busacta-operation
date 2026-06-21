import { z } from "zod";

export const organizerPurposeSchema = z.enum([
  "tax",
  "hr_exam",
  "onboarding",
  "learning_quiz",
  "generic",
]);
export type OrganizerPurpose = z.infer<typeof organizerPurposeSchema>;

export const templateStatusSchema = z.enum(["draft", "published", "archived"]);
export type TemplateStatus = z.infer<typeof templateStatusSchema>;

export const blockTypeSchema = z.enum([
  "section",
  "subsection",
  "info",
  "divider",
  "short_text",
  "long_text",
  "rich_text",
  "number",
  "currency",
  "yes_no",
  "single_choice",
  "multi_choice",
  "date",
  "date_range",
  "file_upload",
  "multi_file",
  "attachment_request",
  "signature",
  "address",
  "rating",
  "matrix",
  "table",
  "calculated",
  "phone",
  "email",
  "url",
  "time",
]);
export type BlockType = z.infer<typeof blockTypeSchema>;

export const displayModeSchema = z.enum(["card", "page"]);
export type DisplayMode = z.infer<typeof displayModeSchema>;

export const deploymentStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "submitted",
  "under_review",
  "graded",
  "returned",
]);
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;

export const targetTypeSchema = z.enum([
  "client_entity",
  "profile",
  "task",
  "project",
  "course",
  "firm",
]);
export type TargetType = z.infer<typeof targetTypeSchema>;

// ----- Conditional rules (boolean tree) -----------------------
export const ruleOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_empty",
  "is_not_empty",
  "contains",
]);

export type ConditionalLeaf = {
  blockId: string;
  op: z.infer<typeof ruleOperatorSchema>;
  value?: unknown;
};
export type ConditionalGroup = {
  op: "AND" | "OR";
  rules: Array<ConditionalLeaf | ConditionalGroup>;
};
export type ConditionalRules = { show_when: ConditionalGroup } | null;

export const conditionalLeafSchema: z.ZodType<ConditionalLeaf> = z.object({
  blockId: z.string().uuid(),
  op: ruleOperatorSchema,
  value: z.unknown().optional(),
});
export const conditionalGroupSchema: z.ZodType<ConditionalGroup> = z.lazy(() =>
  z.object({
    op: z.enum(["AND", "OR"]),
    rules: z.array(z.union([conditionalLeafSchema, conditionalGroupSchema])),
  }),
);
export const conditionalRulesSchema = z.object({ show_when: conditionalGroupSchema }).nullable();

// ----- Per-type config -----------------------------------------
export const blockConfigSchema = z.record(z.string(), z.unknown());

// JSON value type compatible with TanStack's server-fn serializer.
export type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];
export type JsonObject = { [k: string]: JsonValue };

// ----- Domain types --------------------------------------------
export interface OrganizerTemplate {
  id: string;
  name: string;
  description: string | null;
  purpose: OrganizerPurpose;
  is_exam: boolean;
  passing_score: number | null;
  status: TemplateStatus;
  version: number;
  parent_template_id: string | null;
  firm_id: string | null;
  display_mode: DisplayMode;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizerBlock {
  id: string;
  template_id: string;
  parent_id: string | null;
  order_index: number;
  block_type: BlockType;
  question_text: string | null;
  help_text: string | null;
  is_required: boolean;
  config_json: JsonObject;
  conditional_rules_json: JsonObject | null;
  scoring_json: JsonObject | null;
  created_at: string;
  updated_at: string;
}

// ----- Input schemas for server fns ----------------------------
export const createTemplateInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  purpose: organizerPurposeSchema.default("generic"),
  is_exam: z.boolean().default(false),
});

export const updateTemplateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  purpose: organizerPurposeSchema.optional(),
  is_exam: z.boolean().optional(),
  passing_score: z.number().min(0).max(1000).nullable().optional(),
  status: templateStatusSchema.optional(),
  display_mode: displayModeSchema.optional(),
});

export const upsertBlockInput = z.object({
  id: z.string().uuid().optional(),
  template_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  order_index: z.number().int().min(0).optional(),
  block_type: blockTypeSchema,
  question_text: z.string().trim().max(2000).nullable().optional(),
  help_text: z.string().trim().max(2000).nullable().optional(),
  is_required: z.boolean().optional(),
  config_json: blockConfigSchema.optional(),
  conditional_rules_json: conditionalRulesSchema.optional(),
  scoring_json: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const reorderBlocksInput = z.object({
  template_id: z.string().uuid(),
  moves: z
    .array(
      z.object({
        id: z.string().uuid(),
        parent_id: z.string().uuid().nullable(),
        order_index: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(500),
});

export const purposeLabel: Record<OrganizerPurpose, string> = {
  tax: "Tax Organizer",
  hr_exam: "HR Exam",
  onboarding: "Onboarding",
  learning_quiz: "Learning Quiz",
  generic: "Generic Form",
};

export const blockTypeLabel: Record<BlockType, string> = {
  section: "Section",
  subsection: "Subsection",
  info: "Info / Note",
  divider: "Divider",
  short_text: "Short Text",
  long_text: "Long Text",
  rich_text: "Rich Text",
  number: "Number",
  currency: "Currency",
  yes_no: "Yes / No",
  single_choice: "Single Choice",
  multi_choice: "Multiple Choice",
  date: "Date",
  date_range: "Date Range",
  file_upload: "File Upload",
  multi_file: "Multi-File Upload",
  attachment_request: "Attachment Request",
  signature: "Signature",
  address: "Address",
  rating: "Rating",
  matrix: "Matrix / Likert",
  table: "Table",
  calculated: "Calculated Field",
  phone: "Phone Number",
  email: "Email Address",
  url: "Website / URL",
  time: "Time",
};

// ----- Answer envelopes (versioned shapes for new block types) -------------

/** Rich text long-form answer (Tiptap-backed). */
export type RichTextAnswer = {
  kind: "rich";
  html: string; // sanitized HTML for rendering
  json: JsonObject; // Tiptap doc JSON (canonical)
};

/** Legacy plain-text fallback for migrated long_text answers. */
export type PlainTextAnswer = { kind: "plain"; text: string };

export type LongTextAnswer = RichTextAnswer | PlainTextAnswer;

/** Signature: drawn (PNG in storage) or typed (string + font). */
export type SignatureAnswer = {
  kind: "drawn" | "typed";
  storagePath?: string; // for drawn
  typedName?: string; // for typed
  signedAt: string; // ISO timestamp
};

export type MultiFileAnswerItem = {
  storagePath: string;
  name: string;
  size: number;
  mime: string;
};
export type MultiFileAnswer = { files: MultiFileAnswerItem[] };

export type MatrixAnswer = {
  // map row id -> selected column value(s)
  selections: Record<string, string | string[]>;
};

export type CalculatedAnswer = { value: number | null; formula: string };

// ----- Per-type config payloads (config_json shapes) -----------------------

export type MatrixConfig = {
  rows: Array<{ id: string; label: string }>;
  columns: Array<{ id: string; label: string; value: string }>;
  selection: "single" | "multi";
};

export type SignatureConfig = {
  allowTyped: boolean;
  allowDrawn: boolean;
  requireFullName: boolean;
};

export type MultiFileConfig = {
  maxFiles: number;
  maxSizeMb: number;
  acceptedMime: string[];
  minFiles: number;
};

export type CalculatedConfig = {
  formula: string;
  precision: number;
  displayAs: "number" | "currency" | "percent";
};

export type RichTextConfig = {
  toolbar?: Array<"bold" | "italic" | "underline" | "color" | "list" | "table" | "link">;
};
