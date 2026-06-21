import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addDocumentInput,
  createEnvelopeInput,
  listEnvelopesInput,
  updateEnvelopeTargetInput,
  upsertPageLayoutInput,
} from "./schemas";
import {
  addDocumentServer,
  createEnvelopeServer,
  deleteDocumentServer,
  getEnvelopeOverviewServer,
  listEnvelopeIdDocumentsServer,
  listEnvelopesServer,
  listPageLayoutsServer,
  updateEnvelopeTargetServer,
  upsertPageLayoutServer,
} from "./envelopes.server";

export const listEnvelopes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listEnvelopesInput.parse(input))
  .handler(async ({ data }) => {
    const envelopes = await listEnvelopesServer(data ?? {});
    return { envelopes };
  });

export const createEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createEnvelopeInput.parse(input))
  .handler(async ({ data, context }) => {
    const id = await createEnvelopeServer({
      ...data,
      created_by: context.userId,
    });
    return { id };
  });

export const addDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addDocumentInput.parse(input))
  .handler(async ({ data }) => {
    const id = await addDocumentServer(data);
    return { id };
  });

export const getEnvelopeOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ envelope_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    return getEnvelopeOverviewServer(data.envelope_id);
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deleteDocumentServer(data.document_id);
    return { ok: true };
  });

export const updateEnvelopeTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateEnvelopeTargetInput.parse(input))
  .handler(async ({ data }) => {
    await updateEnvelopeTargetServer(data.envelope_id, data.target);
    return { ok: true };
  });

export const listPageLayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ envelope_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const layouts = await listPageLayoutsServer(data.envelope_id);
    return { layouts };
  });

export const upsertPageLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertPageLayoutInput.parse(input))
  .handler(async ({ data }) => {
    await upsertPageLayoutServer({
      envelope_id: data.envelope_id,
      document_id: data.document_id,
      page_index: data.page_index,
      recipient_id: data.recipient_id,
      mode: data.mode,
      orientation: data.orientation ?? null,
      sequence: data.sequence,
      origin_x_pt: data.origin_x_pt ?? null,
      origin_y_pt: data.origin_y_pt ?? null,
      spacing_pt: data.spacing_pt,
    });
    return { ok: true };
  });

export const listEnvelopeIdDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ envelope_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Gate: caller must be able to manage this envelope (firm manager/admin).
    const { data: ok, error } = await context.supabase.rpc("can_manage_esign_envelope", {
      _envelope_id: data.envelope_id,
    });
    if (error) throw new Error(error.message);
    if (!ok) throw new Error("Forbidden");
    const documents = await listEnvelopeIdDocumentsServer(data.envelope_id);
    return { documents };
  });
