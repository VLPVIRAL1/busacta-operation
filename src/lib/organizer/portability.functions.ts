import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ORGANIZER_EXPORT_FORMAT,
  exportTemplateServer,
  importTemplateServer,
  type OrganizerExportPayload,
} from "./portability.server";
import { organizerPurposeSchema } from "./schemas";

const exportPayloadSchema = z.object({
  format: z.literal(ORGANIZER_EXPORT_FORMAT),
  exported_at: z.string(),
  template: z.object({
    name: z.string().min(1).max(200),
    description: z.string().nullable(),
    purpose: organizerPurposeSchema,
    is_exam: z.boolean(),
    passing_score: z.number().nullable(),
  }),
  blocks: z
    .array(
      z.object({
        id: z.string(),
        parent_id: z.string().nullable(),
        order_index: z.number().int().min(0),
        block_type: z.string(),
        question_text: z.string().nullable(),
        help_text: z.string().nullable(),
        is_required: z.boolean(),
        config_json: z.record(z.string(), z.unknown()).nullable(),
        conditional_rules_json: z.record(z.string(), z.unknown()).nullable(),
        scoring_json: z.record(z.string(), z.unknown()).nullable(),
      }),
    )
    .max(2000),
});

export const exportTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const payload = await exportTemplateServer(data.id);
    // Stringify to keep TanStack's serializable-return check happy with our
    // generic JSON shape (unknown values inside config_json etc.).
    return { json: JSON.stringify(payload) };
  });

export const importTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        payload: exportPayloadSchema,
        nameOverride: z.string().trim().min(1).max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const template = await importTemplateServer({
      payload: data.payload as OrganizerExportPayload,
      createdBy: context.userId,
      nameOverride: data.nameOverride ?? null,
    });
    return { template };
  });
