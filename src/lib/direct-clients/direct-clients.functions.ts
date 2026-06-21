import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createDirectClientServer } from "./direct-clients.server";

const createInput = z.object({
  // Provenance discriminator — server fn rejects any caller that does not
  // route through the B2C Client Hub UI.
  origin: z.literal("direct_client_hub"),
  display_name: z.string().min(1).max(200),
  legal_name: z.string().max(200).optional().nullable(),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().nullable(),
  client_type: z.enum(["individual", "business"]),
  identifier: z.string().max(50).optional().nullable(),
  task_type_id: z.string().uuid().optional().nullable(),
  organizer_template_id: z.string().uuid().optional().nullable(),
});

export const createDirectClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createInput.parse(input))
  .handler(async ({ data, context }) => {
    return createDirectClientServer({
      display_name: data.display_name,
      legal_name: data.legal_name,
      email: data.email,
      phone: data.phone,
      client_type: data.client_type,
      identifier: data.identifier,
      task_type_id: data.task_type_id ?? null,
      organizer_template_id: data.organizer_template_id ?? null,
      created_by: context.userId,
    });
  });
