/**
 * Shared Zod schemas for the Operations module.
 *
 * Server-function–specific schemas (BulkCreateInputSchema etc.) live alongside
 * their createServerFn calls in *.functions.ts, but the row-level schemas and
 * their inferred types are re-exported here so client-side code (form
 * validation, bulk-grid row checking) can import types without pulling in
 * server-only middleware.
 */
import { z } from "zod";

// ─── Bulk task import ────────────────────────────────────────────────────────

export const BulkTaskRowSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required"),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "in_progress", "review", "waiting_client", "complete"]).default("draft"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  complexity: z.enum(["a_hard", "b_medium", "c_easy"]).default("b_medium"),
  period: z.enum(["Monthly", "Quarterly", "Yearly", "Ad-hoc"]).nullable().optional(),
  taxYear: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  software: z
    .enum(["lacerte", "drake", "cch_axcess", "ultratax", "proconnect", "other"])
    .nullable()
    .optional(),
});

export type BulkTaskRowInput = z.infer<typeof BulkTaskRowSchema>;

// ─── Action-item kinds ───────────────────────────────────────────────────────

export const ACTION_ITEM_KIND = z.enum([
  "open_point",
  "clarification",
  "document_needed",
  "information_required",
  "confirm",
  "other",
]);
export type ActionItemKind = z.infer<typeof ACTION_ITEM_KIND>;

export const ACTION_ITEM_STATUS = z.enum(["todo", "in_progress", "done"]);
export type ActionItemStatus = z.infer<typeof ACTION_ITEM_STATUS>;

// ─── Open-point / action-item form ──────────────────────────────────────────

export const OpenPointFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  kind: ACTION_ITEM_KIND,
  status: ACTION_ITEM_STATUS,
});
export type OpenPointFormValues = z.infer<typeof OpenPointFormSchema>;

// ─── SOP / Note form ─────────────────────────────────────────────────────────

export const SopFormSchema = z.object({
  title: z.string().trim().min(1, "Heading is required"),
  body: z.string().min(1, "Body is required"),
  is_internal: z.boolean().default(true),
});
export type SopFormValues = z.infer<typeof SopFormSchema>;

export const NoteFormSchema = z.object({
  title: z.string().trim().nullable().optional(),
  body: z.string().min(1, "Note body is required"),
  is_internal: z.boolean().default(true),
});
export type NoteFormValues = z.infer<typeof NoteFormSchema>;

// ─── Work-item create / edit ─────────────────────────────────────────────────

export const WorkItemFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  clientId: z.string().uuid("Please select a client"),
  priority: z.string().default("medium"),
  complexity: z.enum(["a_hard", "b_medium", "c_easy"]).default("b_medium"),
  period: z.enum(["Monthly", "Quarterly", "Yearly", "Ad-hoc", "none"]).optional(),
  taxYear: z.string().optional(),
  returnTypeId: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  dueDate: z.string().min(1, "Due date is required"),
});
export type WorkItemFormValues = z.infer<typeof WorkItemFormSchema>;
