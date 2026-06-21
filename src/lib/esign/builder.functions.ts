import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fieldInput, sendEnvelopeInput, upsertRecipientsInput } from "./schemas";
import { upsertRecipientsServer } from "./recipients.server";
import { deleteFieldServer, listFieldsServer, upsertFieldServer } from "./fields.server";
import { getEnvelopeAuditServer, sendEnvelopeServer, voidEnvelopeServer } from "./send.server";
import { mintRecipientSigningLink } from "./links.server";
import { createSampleEnvelopeServer, pickFirmForUserServer } from "./sample.server";
import { resolvePublicOrigin } from "./origin.server";

function resolveOrigin(): string {
  return resolvePublicOrigin();
}

export const createSampleEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ firm_id: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const firmId = data.firm_id ?? (await pickFirmForUserServer(context.userId));
    if (!firmId) throw new Error("No firm available to attach the sample envelope to");
    return createSampleEnvelopeServer({
      user_id: context.userId,
      firm_id: firmId,
      origin: resolveOrigin(),
    });
  });

export const upsertRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertRecipientsInput.parse(input))
  .handler(async ({ data }) => {
    return upsertRecipientsServer(data.envelope_id, data.recipients);
  });

export const listFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ envelope_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const fields = await listFieldsServer(data.envelope_id);
    return { fields };
  });

export const upsertField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fieldInput.parse(input))
  .handler(async ({ data }) => {
    const id = await upsertFieldServer(data);
    return { id };
  });

export const deleteField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ field_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deleteFieldServer(data.field_id);
    return { ok: true };
  });

export const sendEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendEnvelopeInput.parse(input))
  .handler(async ({ data }) => {
    return sendEnvelopeServer(data.envelope_id, resolvePublicOrigin());
  });

export const voidEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        envelope_id: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await voidEnvelopeServer(data.envelope_id, data.reason);
    return { ok: true };
  });

export const getEnvelopeAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ envelope_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const audit = await getEnvelopeAuditServer(data.envelope_id);
    return { audit };
  });

export const getRecipientSigningLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        envelope_id: z.string().uuid(),
        recipient_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const link = await mintRecipientSigningLink(
      data.envelope_id,
      data.recipient_id,
      resolvePublicOrigin(),
    );
    return { link };
  });
