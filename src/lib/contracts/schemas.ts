import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const contractTypeSchema = z.enum(["nda", "sla", "other"]);
export type ContractType = z.infer<typeof contractTypeSchema>;

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  nda: "NDA",
  sla: "SLA",
  other: "Other",
};

export const contractTemplateStatusSchema = z.enum(["draft", "published", "archived"]);
export type ContractTemplateStatus = z.infer<typeof contractTemplateStatusSchema>;

export const contractDocFormatSchema = z.enum(["docx", "pdf"]);
export type ContractDocFormat = z.infer<typeof contractDocFormatSchema>;

// ─── Domain types (mirror DB rows) ───────────────────────────────────────────

export interface ContractProfile {
  id: string;
  registered_legal_name: string;
  trading_name: string | null;
  address: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  jurisdiction: string | null;
  effective_date: string | null;
  email: string | null;
  phone: string | null;
  contract_type: ContractType;
  status: string;
  owner_id: string | null;
  lead_id: string | null;
  campaign_id: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  contract_type: ContractType;
  status: ContractTemplateStatus;
  body_html: string;
  body_json: Record<string, unknown>;
  version: number;
  parent_template_id: string | null;
  jurisdiction: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContractDocument {
  id: string;
  template_id: string | null;
  template_name: string;
  profile_id: string | null;
  profile_name: string;
  contract_type: ContractType;
  output_format: ContractDocFormat;
  file_name: string;
  generated_by: string;
  generated_at: string;
}

/** Profile + joined lead/campaign names + firm name, for the generation step. */
export interface ProfileMergeBundle {
  profile: ContractProfile;
  leadCompany: string | null;
  campaignName: string | null;
  firmName: string | null;
}

// ─── Profile inputs ───────────────────────────────────────────────────────────

const profileFields = {
  registered_legal_name: z.string().min(1).max(300),
  trading_name: z.string().max(300).nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  signatory_name: z.string().max(200).nullable().optional(),
  signatory_title: z.string().max(200).nullable().optional(),
  jurisdiction: z.string().max(200).nullable().optional(),
  effective_date: z.string().nullable().optional(),
  email: z.string().max(320).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  contract_type: contractTypeSchema.optional(),
  status: z.string().max(40).optional(),
  owner_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  campaign_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
};

export const createContractProfileInput = z.object(profileFields);
export type CreateContractProfileInput = z.infer<typeof createContractProfileInput>;

export const updateContractProfileInput = z
  .object({ id: z.string().uuid() })
  .extend(profileFields)
  .partial({ registered_legal_name: true });
export type UpdateContractProfileInput = z.infer<typeof updateContractProfileInput>;

export const listProfilesInput = z
  .object({
    contractType: contractTypeSchema.optional(),
    status: z.string().optional(),
    ownerId: z.string().uuid().optional(),
    jurisdiction: z.string().optional(),
    search: z.string().optional(),
  })
  .partial();
export type ListProfilesInput = z.infer<typeof listProfilesInput>;

// ─── Template inputs ───────────────────────────────────────────────────────────

export const upsertContractTemplateInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  contract_type: contractTypeSchema,
  status: contractTemplateStatusSchema.optional(),
  body_html: z.string(),
  body_json: z.record(z.unknown()),
  jurisdiction: z.string().max(200).nullable().optional(),
});
export type UpsertContractTemplateInput = z.infer<typeof upsertContractTemplateInput>;

export const listTemplatesInput = z
  .object({
    contractType: contractTypeSchema.optional(),
    status: contractTemplateStatusSchema.optional(),
    jurisdiction: z.string().optional(),
    search: z.string().optional(),
  })
  .partial();
export type ListTemplatesInput = z.infer<typeof listTemplatesInput>;

// ─── Audit input ───────────────────────────────────────────────────────────────

export const recordContractDocumentInput = z.object({
  template_id: z.string().uuid().nullable().optional(),
  template_name: z.string().min(1).max(300),
  profile_id: z.string().uuid().nullable().optional(),
  profile_name: z.string().min(1).max(300),
  contract_type: contractTypeSchema,
  output_format: contractDocFormatSchema,
  file_name: z.string().min(1).max(300),
});
export type RecordContractDocumentInput = z.infer<typeof recordContractDocumentInput>;

export const listDocumentsInput = z
  .object({
    contractType: contractTypeSchema.optional(),
    outputFormat: contractDocFormatSchema.optional(),
    generatedBy: z.string().uuid().optional(),
  })
  .partial();
export type ListDocumentsInput = z.infer<typeof listDocumentsInput>;
