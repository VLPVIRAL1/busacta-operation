import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyTemplateToEnvelopeServer,
  deleteTemplateServer,
  getTemplateServer,
  listTemplatesServer,
  saveTemplateFromEnvelopeServer,
} from "./templates.server";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ firm_id: z.string().uuid().optional() }).optional().default({}).parse(input),
  )
  .handler(async ({ data }) => {
    const templates = await listTemplatesServer(data?.firm_id);
    return { templates };
  });

export const getTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ template_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    return getTemplateServer(data.template_id);
  });

export const saveTemplateFromEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        envelope_id: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        doc_kind: z.string().trim().max(60).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const id = await saveTemplateFromEnvelopeServer({
      envelope_id: data.envelope_id,
      name: data.name,
      doc_kind: data.doc_kind ?? null,
      created_by: context.userId,
    });
    return { id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ template_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deleteTemplateServer(data.template_id);
    return { ok: true };
  });

export const applyTemplateToEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        envelope_id: z.string().uuid(),
        template_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return applyTemplateToEnvelopeServer(data);
  });
