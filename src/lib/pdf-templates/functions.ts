import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  createTemplateInput,
  updateTemplateInput,
  upsertFieldInput,
  reorderFieldsInput,
} from "./schemas";
import {
  createTemplateServer,
  deleteFieldServer,
  deleteTemplateServer,
  duplicateTemplateServer,
  getTemplateWithFieldsServer,
  getVersionHistoryServer,
  listTemplatesServer,
  publishTemplateServer,
  reorderFieldsServer,
  updateTemplateServer,
  upsertFieldServer,
} from "./server";

export const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ docType: z.string().optional(), firmId: z.string().uuid().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const templates = await listTemplatesServer({ docType: data.docType, firmId: data.firmId });
    return { templates };
  });

export const getTemplateWithFieldsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  // @ts-expect-error TanStack Start type inference limitation with JSONB Record<string,unknown> fields
  .handler(async ({ data }: { data: { id: string } }) => {
    const result = await getTemplateWithFieldsServer(data.id);
    return result;
  });

export const createTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createTemplateInput.parse(input))
  .handler(async ({ data, context }) => {
    const template = await createTemplateServer({
      name: data.name,
      doc_type: data.doc_type,
      description: data.description ?? null,
      firm_id: data.firm_id ?? null,
      is_global: data.is_global ?? false,
      createdBy: context.userId,
    });
    return { template };
  });

export const updateTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateTemplateInput.parse(input))
  .handler(async ({ data }) => {
    const { id, ...patch } = data;
    const template = await updateTemplateServer({ id, patch: patch as Record<string, unknown> });
    return { template };
  });

export const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deleteTemplateServer(data.id);
    return { ok: true };
  });

export const upsertFieldFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertFieldInput.parse(input))
  // @ts-expect-error TanStack Start type inference limitation with JSONB Record<string,unknown> fields
  .handler(async ({ data }: { data: import("./schemas").UpsertFieldInput }) => {
    const field = await upsertFieldServer(data);
    return { field };
  });

export const deleteFieldFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deleteFieldServer(data.id);
    return { ok: true };
  });

export const reorderFieldsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reorderFieldsInput.parse(input))
  .handler(async ({ data }) => {
    await reorderFieldsServer(data);
    return { ok: true };
  });

export const publishTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const template = await publishTemplateServer({ id: data.id, actorId: context.userId });
    return { template };
  });

export const duplicateTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const template = await duplicateTemplateServer({ id: data.id, actorId: context.userId });
    return { template };
  });

export const getVersionHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const versions = await getVersionHistoryServer(data.id);
    return { versions };
  });
