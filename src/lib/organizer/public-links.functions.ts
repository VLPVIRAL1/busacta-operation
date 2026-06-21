import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createPublicLinkServer,
  deletePublicLinkServer,
  listPublicLinksServer,
  revokePublicLinkServer,
} from "./public-links.server";

export const createPublicLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        template_id: z.string().uuid(),
        label: z.string().trim().max(120).nullable().optional(),
        firm_id: z.string().uuid().nullable().optional(),
        expires_at: z.string().datetime().nullable().optional(),
        max_submissions: z.number().int().min(1).max(100000).nullable().optional(),
        require_identity: z.boolean().optional(),
        password: z.string().min(4).max(128).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const link = await createPublicLinkServer({
      ...data,
      created_by: context.userId,
    });
    return { link };
  });

export const listPublicLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ template_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const links = await listPublicLinksServer(data.template_id);
    return { links };
  });

export const revokePublicLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await revokePublicLinkServer(data.id);
    return { ok: true };
  });

export const deletePublicLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await deletePublicLinkServer(data.id);
    return { ok: true };
  });
