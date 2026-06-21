import { z } from "zod";

export const envelopeStatuses = [
  "draft",
  "sent",
  "in_progress",
  "completed",
  "declined",
  "voided",
  "expired",
] as const;
export type EnvelopeStatus = (typeof envelopeStatuses)[number];

export const routingModes = ["parallel", "sequential"] as const;
export type RoutingMode = (typeof routingModes)[number];

export const recipientRoles = ["signer", "approver", "viewer", "cc"] as const;
export type RecipientRole = (typeof recipientRoles)[number];

export const authMethods = ["email_link", "sms_otp", "access_code"] as const;
export type AuthMethod = (typeof authMethods)[number];

export const fieldTypes = [
  "signature",
  "initials",
  "text",
  "checkbox",
  "radio",
  "date_signed",
  "name",
  "email",
  "company",
  "title",
  "attachment",
  "signer_id_document",
] as const;
export type FieldType = (typeof fieldTypes)[number];

export const esignTargetKinds = ["direct_client", "cpa", "hr"] as const;
export type EsignTargetKind = (typeof esignTargetKinds)[number];

export const esignTargetInput = z
  .object({
    kind: z.enum(esignTargetKinds),
    direct_client_id: z.string().uuid().nullish(),
    profile_id: z.string().uuid().nullish(),
    task_id: z.string().uuid().nullish(),
    organizer_deployment_id: z.string().uuid().nullish(),
  })
  .nullish();

export const createEnvelopeInput = z.object({
  firm_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  project_id: z.string().uuid().nullish(),
  message: z.string().trim().max(2000).optional().nullable(),
  routing_mode: z.enum(routingModes).default("sequential"),
  expires_in_days: z.number().int().min(1).max(180).default(30),
  reminder_cadence_hours: z.number().int().min(1).max(720).default(48),
  target: esignTargetInput,
});
export type CreateEnvelopeInput = z.infer<typeof createEnvelopeInput>;

export const updateEnvelopeTargetInput = z.object({
  envelope_id: z.string().uuid(),
  target: z.object({
    kind: z.enum(esignTargetKinds),
    direct_client_id: z.string().uuid().nullish(),
    profile_id: z.string().uuid().nullish(),
    task_id: z.string().uuid().nullish(),
    organizer_deployment_id: z.string().uuid().nullish(),
  }),
});

// Page layout overlay (Auto-Arrange engine)
export const pageLayoutOrientations = ["horizontal", "vertical"] as const;
export const pageLayoutModes = ["manual", "auto"] as const;

export const upsertPageLayoutInput = z.object({
  envelope_id: z.string().uuid(),
  document_id: z.string().uuid(),
  page_index: z.number().int().min(0).max(999),
  recipient_id: z.string().uuid(),
  mode: z.enum(pageLayoutModes),
  orientation: z.enum(pageLayoutOrientations).nullish(),
  sequence: z.array(z.string().uuid()).max(200).default([]),
  origin_x_pt: z.number().nullish(),
  origin_y_pt: z.number().nullish(),
  spacing_pt: z.number().min(0).max(72).default(8),
});
export type UpsertPageLayoutInput = z.infer<typeof upsertPageLayoutInput>;

export const addDocumentInput = z.object({
  envelope_id: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  source_mime: z.string().min(1).max(120),
  source_path: z.string().min(1).max(500),
  order_index: z.number().int().min(0).max(99).default(0),
});

export const listEnvelopesInput = z
  .object({
    firm_id: z.string().uuid().optional(),
    status: z.enum(envelopeStatuses).optional(),
  })
  .optional()
  .default({});

export type EnvelopeRow = {
  id: string;
  firm_id: string;
  project_id: string | null;
  title: string;
  status: EnvelopeStatus;
  routing_mode: RoutingMode;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

// ---------- Recipients ----------
export const recipientInput = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  role: z.enum(recipientRoles).default("signer"),
  auth_method: z.enum(authMethods).default("email_link"),
  routing_order: z.number().int().min(1).max(99).default(1),
  phone_e164: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{6,15}$/)
    .optional()
    .nullable(),
  color_hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type RecipientInput = z.infer<typeof recipientInput>;

export const upsertRecipientsInput = z.object({
  envelope_id: z.string().uuid(),
  recipients: z.array(recipientInput).min(0).max(20),
});

// ---------- Fields ----------
export const fieldChoice = z.object({
  value: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
});
export type FieldChoice = z.infer<typeof fieldChoice>;

export const fieldValidation = z
  .object({
    regex: z.string().max(500).optional(),
    regex_message: z.string().max(200).optional(),
    min_length: z.number().int().min(0).max(10000).optional(),
    max_length: z.number().int().min(1).max(10000).optional(),
  })
  .partial();
export type FieldValidation = z.infer<typeof fieldValidation>;

export const fieldOptions = z
  .object({
    choices: z.array(fieldChoice).max(20).optional(),
    validation: fieldValidation.optional(),
    tooltip: z.string().max(280).optional(),
  })
  .partial();
export type FieldOptions = z.infer<typeof fieldOptions>;

export const conditionalOperators = [
  "equals",
  "not_equals",
  "checked",
  "not_checked",
  "non_empty",
] as const;
export type ConditionalOperator = (typeof conditionalOperators)[number];

export const fieldConditional = z.object({
  source_field_id: z.string().uuid(),
  operator: z.enum(conditionalOperators),
  value: z.string().max(200).optional(),
});
export type FieldConditional = z.infer<typeof fieldConditional>;

export const fieldInput = z.object({
  id: z.string().uuid().optional(),
  envelope_id: z.string().uuid(),
  document_id: z.string().uuid(),
  recipient_id: z.string().uuid(),
  field_type: z.enum(fieldTypes),
  page_index: z.number().int().min(0).max(999),
  // Stored as fractions 0–1 of page width/height (resolution-independent).
  x_pt: z.number().min(0).max(1),
  y_pt: z.number().min(0).max(1),
  width_pt: z.number().min(0.005).max(1),
  height_pt: z.number().min(0.005).max(1),
  is_required: z.boolean().default(true),
  default_value: z.string().max(500).optional().nullable(),
  options_json: fieldOptions.optional().nullable(),
  conditional_json: fieldConditional.optional().nullable(),
  tab_order: z.number().int().min(0).max(9999).optional().nullable(),
});
export type FieldInput = z.infer<typeof fieldInput>;

export const sendEnvelopeInput = z.object({
  envelope_id: z.string().uuid(),
});

// ---------- Shared evaluators (used by builder + signer) ----------
export function isFieldVisible(
  conditional: FieldConditional | null | undefined,
  resolveValue: (sourceFieldId: string) => string | undefined,
): boolean {
  if (!conditional) return true;
  const raw = resolveValue(conditional.source_field_id);
  const v = (raw ?? "").trim();
  switch (conditional.operator) {
    case "equals":
      return v === (conditional.value ?? "");
    case "not_equals":
      return v !== (conditional.value ?? "");
    case "checked":
      return v === "true";
    case "not_checked":
      return v !== "true";
    case "non_empty":
      return v.length > 0;
    default:
      return true;
  }
}

export function validateFieldValue(
  fieldType: FieldType,
  isRequired: boolean,
  visible: boolean,
  value: string | null | undefined,
  options: FieldOptions | null | undefined,
): string | null {
  if (!visible) return null;
  // Image/file-uploaded types are validated by presence of upload, not text.
  if (fieldType === "signature" || fieldType === "initials" || fieldType === "signer_id_document") {
    return null;
  }
  const v = (value ?? "").trim();

  if (isRequired && v.length === 0) {
    if (fieldType === "checkbox") return "This must be checked";
    return "This field is required";
  }
  if (v.length === 0) return null;

  if (fieldType === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email";
  }
  const rules = options?.validation;
  if (rules?.min_length != null && v.length < rules.min_length) {
    return `Must be at least ${rules.min_length} characters`;
  }
  if (rules?.max_length != null && v.length > rules.max_length) {
    return `Must be at most ${rules.max_length} characters`;
  }
  if (rules?.regex) {
    try {
      const re = new RegExp(rules.regex);
      if (!re.test(v)) return rules.regex_message ?? "Invalid format";
    } catch {
      /* ignore malformed regex */
    }
  }
  if (fieldType === "radio" && options?.choices?.length) {
    if (!options.choices.some((c) => c.value === v)) {
      return "Choose one of the options";
    }
  }
  return null;
}
