import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendRecipientReminder, updateEnvelopeProjectServer } from "./reminders.server";

export const resendRecipientReminder = createServerFn({ method: "POST" })
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
    let host = "";
    try {
      host = `https://${getRequestHost()}`;
    } catch {
      host = "";
    }
    const link = await sendRecipientReminder(data.envelope_id, data.recipient_id, host);
    return { ok: true, link };
  });

export const updateEnvelopeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        envelope_id: z.string().uuid(),
        project_id: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await updateEnvelopeProjectServer(data.envelope_id, data.project_id);
    return { ok: true };
  });
