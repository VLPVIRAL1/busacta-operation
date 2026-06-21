/**
 * Public signer-portal server functions. These are intentionally NOT gated by
 * requireSupabaseAuth — the caller is an unauthenticated end-user holding a
 * JWT signed with the envelope's secret.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  declineSigningServer,
  loadSignerSession,
  submitSignerValues,
  type SubmittedField,
} from "./signer.server";

const tokenSchema = z.object({ token: z.string().min(20).max(4096) });

const submitInput = z.object({
  token: z.string().min(20).max(4096),
  values: z
    .array(
      z.object({
        field_id: z.string().uuid(),
        value_text: z.string().max(5000).optional().nullable(),
        value_image_data_url: z
          .string()
          .regex(/^data:(image\/(png|jpeg|jpg)|application\/pdf);base64,/)
          .max(12_000_000)
          .optional()
          .nullable(),
      }),
    )
    .max(200),
});

const declineInput = z.object({
  token: z.string().min(20).max(4096),
  reason: z.string().trim().min(3).max(500),
});

function requestMeta() {
  let ua: string | null = null;
  let ip: string | null = null;
  try {
    ua = getRequestHeader("user-agent") ?? null;
  } catch {
    /* noop */
  }
  try {
    ip =
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      getRequestHeader("cf-connecting-ip") ??
      null;
  } catch {
    /* noop */
  }
  return { user_agent: ua, ip };
}

export const getSignerSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    return loadSignerSession(data.token);
  });

export const submitSignerSubmission = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submitInput.parse(input))
  .handler(async ({ data }) => {
    const values: SubmittedField[] = data.values.map((v) => ({
      field_id: v.field_id,
      value_text: v.value_text ?? null,
      value_image_data_url: v.value_image_data_url ?? null,
    }));
    return submitSignerValues(data.token, values, requestMeta());
  });

export const declineSigning = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => declineInput.parse(input))
  .handler(async ({ data }) => {
    await declineSigningServer(data.token, data.reason, requestMeta());
    return { ok: true };
  });
