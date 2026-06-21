import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const pdfDocTypeSchema = z.enum(["salary_slip", "financial_report"]);
export type PdfDocType = z.infer<typeof pdfDocTypeSchema>;

export const PDF_DOC_TYPE_LABELS: Record<PdfDocType, string> = {
  salary_slip: "Salary Slip",
  financial_report: "Financial Report",
};

export const pdfTemplateStatusSchema = z.enum(["draft", "published", "archived"]);
export type PdfTemplateStatus = z.infer<typeof pdfTemplateStatusSchema>;

export const pdfFieldTypeSchema = z.enum([
  "section",
  "logo",
  "static_text",
  "placeholder",
  "divider",
  "spacer",
  "line_items_table",
  "totals_block",
  "earnings_deductions_table",
  "report_table",
  "signature_block",
  "payment_details",
  "notes_block",
]);
export type PdfFieldType = z.infer<typeof pdfFieldTypeSchema>;

export const PDF_FIELD_TYPE_LABELS: Record<PdfFieldType, string> = {
  section: "Section",
  logo: "Logo",
  static_text: "Static Text",
  placeholder: "Data Field",
  divider: "Divider",
  spacer: "Spacer",
  line_items_table: "Line Items Table",
  totals_block: "Totals Block",
  earnings_deductions_table: "Earnings & Deductions",
  report_table: "Report Table",
  signature_block: "Signature Block",
  payment_details: "Payment Details",
  notes_block: "Notes / Terms",
};

// ─── Domain types (mirror DB rows) ──────────────────────────────────────────

export interface PdfTemplate {
  id: string;
  name: string;
  description: string | null;
  doc_type: PdfDocType;
  status: PdfTemplateStatus;
  version: number;
  parent_template_id: string | null;
  firm_id: string | null;
  is_global: boolean;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  logo_storage_path: string | null;
  page_size: string;
  orientation: string;
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PdfTemplateField {
  id: string;
  template_id: string;
  parent_id: string | null;
  order_index: number;
  field_type: PdfFieldType;
  label: string | null;
  config_json: Record<string, unknown>;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Input validators ────────────────────────────────────────────────────────

export const createTemplateInput = z.object({
  name: z.string().min(1).max(200),
  doc_type: pdfDocTypeSchema,
  description: z.string().max(2000).optional(),
  firm_id: z.string().uuid().optional(),
  is_global: z.boolean().optional(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateInput>;

export const updateTemplateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  font_family: z.string().optional(),
  logo_storage_path: z.string().nullable().optional(),
  page_size: z.string().optional(),
  orientation: z.enum(["portrait", "landscape"]).optional(),
  margin_top: z.number().optional(),
  margin_right: z.number().optional(),
  margin_bottom: z.number().optional(),
  margin_left: z.number().optional(),
  status: pdfTemplateStatusSchema.optional(),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateInput>;

export const upsertFieldInput = z.object({
  id: z.string().uuid().optional(),
  template_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  order_index: z.number().int().min(0).optional(),
  field_type: pdfFieldTypeSchema,
  label: z.string().max(200).nullable().optional(),
  config_json: z.record(z.unknown()).optional(),
  is_visible: z.boolean().optional(),
});
export type UpsertFieldInput = z.infer<typeof upsertFieldInput>;

export const reorderFieldsInput = z.object({
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
export type ReorderFieldsInput = z.infer<typeof reorderFieldsInput>;

// ─── Field config type helpers ───────────────────────────────────────────────

export interface SectionConfig {
  columns?: 1 | 2 | 3;
  background?: string;
  padding_top?: number;
  padding_bottom?: number;
}

export interface StaticTextConfig {
  content: string;
  font_size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  alignment?: "left" | "center" | "right";
}

export interface PlaceholderConfig {
  token: string;
  fallback?: string;
  font_size?: number;
  bold?: boolean;
  color?: string;
  prefix?: string;
  suffix?: string;
}

export interface SpacerConfig {
  height: number;
}

export interface LineItemsTableConfig {
  show_index?: boolean;
  show_quantity?: boolean;
  show_rate?: boolean;
  header_color?: string;
}

export interface TotalsBlockConfig {
  show_subtotal?: boolean;
  show_tax?: boolean;
  show_total?: boolean;
  show_amount_paid?: boolean;
  show_balance_due?: boolean;
}

export interface SignatureBlockConfig {
  signatory_name?: string;
  signatory_title?: string;
  show_date_line?: boolean;
}

export interface NotesBlockConfig {
  content?: string;
  label?: string;
}

export interface LogoConfig {
  width?: number;
  alignment?: "left" | "center" | "right";
}
