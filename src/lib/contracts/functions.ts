import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  createContractProfileInput,
  listDocumentsInput,
  listProfilesInput,
  listTemplatesInput,
  recordContractDocumentInput,
  updateContractProfileInput,
  upsertContractTemplateInput,
} from "./schemas";
import {
  createProfileServer,
  deleteProfileServer,
  deleteTemplateServer,
  duplicateTemplateServer,
  getProfileMergeBundleServer,
  getTemplateServer,
  listCampaignOptionsServer,
  listDocumentsServer,
  listLeadOptionsServer,
  listProfilesServer,
  listTemplatesServer,
  recordContractDocumentServer,
  updateProfileServer,
  upsertTemplateServer,
} from "./server";

// ─── Profiles ────────────────────────────────────────────────────────────────

export const listContractProfilesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listProfilesInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const profiles = await listProfilesServer(data);
    return { profiles };
  });

export const createContractProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createContractProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const profile = await createProfileServer({ ...data, createdBy: context.userId });
    return { profile };
  });

export const updateContractProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateContractProfileInput.parse(input))
  .handler(async ({ data }) => {
    const profile = await updateProfileServer(data);
    return { profile };
  });

export const deleteContractProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deleteProfileServer(data.id);
    return { ok: true };
  });

export const getProfileMergeBundleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const bundle = await getProfileMergeBundleServer(data.id);
    return bundle;
  });

// ─── Templates ───────────────────────────────────────────────────────────────

export const listContractTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listTemplatesInput.parse(input ?? {}))
  // @ts-expect-error TanStack Start type inference limitation with JSONB Record<string,unknown> fields
  .handler(async ({ data }) => {
    const templates = await listTemplatesServer(data);
    return { templates };
  });

export const getContractTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  // @ts-expect-error TanStack Start type inference limitation with JSONB Record<string,unknown> fields
  .handler(async ({ data }: { data: { id: string } }) => {
    const template = await getTemplateServer(data.id);
    return { template };
  });

export const upsertContractTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertContractTemplateInput.parse(input))
  // @ts-expect-error TanStack Start type inference limitation with JSONB Record<string,unknown> fields
  .handler(async ({ data, context }) => {
    const template = await upsertTemplateServer({ ...data, createdBy: context.userId });
    return { template };
  });

export const deleteContractTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deleteTemplateServer(data.id);
    return { ok: true };
  });

export const duplicateContractTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  // @ts-expect-error TanStack Start type inference limitation with JSONB Record<string,unknown> fields
  .handler(async ({ data, context }) => {
    const template = await duplicateTemplateServer({ id: data.id, actorId: context.userId });
    return { template };
  });

// ─── Audit trail ───────────────────────────────────────────────────────────────

export const recordContractDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordContractDocumentInput.parse(input))
  .handler(async ({ data, context }) => {
    const document = await recordContractDocumentServer({ ...data, generatedBy: context.userId });
    return { document };
  });

export const listContractDocumentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listDocumentsInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const documents = await listDocumentsServer(data);
    return { documents };
  });

// ─── Link option lookups ─────────────────────────────────────────────────────

export const listLeadOptionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const options = await listLeadOptionsServer();
    return { options };
  });

export const listCampaignOptionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const options = await listCampaignOptionsServer();
    return { options };
  });
