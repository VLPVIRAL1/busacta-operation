import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createTemplateInput,
  reorderBlocksInput,
  updateTemplateInput,
  upsertBlockInput,
} from "./schemas";
import {
  createTemplateServer,
  deleteBlockServer,
  deleteTemplateServer,
  getTemplateWithBlocksServer,
  listTemplatesServer,
  publishTemplateServer,
  reorderBlocksServer,
  updateTemplateServer,
  upsertBlockServer,
} from "./templates.server";
import { z } from "zod";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const templates = await listTemplatesServer();
    return { templates };
  });

export const getTemplateWithBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    return getTemplateWithBlocksServer(data.id);
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createTemplateInput.parse(input))
  .handler(async ({ data, context }) => {
    const template = await createTemplateServer({
      name: data.name,
      description: data.description ?? null,
      purpose: data.purpose,
      is_exam: data.is_exam,
      createdBy: context.userId,
    });
    return { template };
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateTemplateInput.parse(input))
  .handler(async ({ data }) => {
    const { id, ...patch } = data;
    const template = await updateTemplateServer({ id, patch });
    return { template };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deleteTemplateServer(data.id);
    return { ok: true };
  });

export const upsertBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertBlockInput.parse(input))
  .handler(async ({ data }) => {
    const block = await upsertBlockServer(data);
    return { block };
  });

export const deleteBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deleteBlockServer(data.id);
    return { ok: true };
  });

export const reorderBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reorderBlocksInput.parse(input))
  .handler(async ({ data }) => {
    await reorderBlocksServer(data);
    return { ok: true };
  });

export const publishTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const template = await publishTemplateServer({
      id: data.id,
      actorId: context.userId,
    });
    return { template };
  });
