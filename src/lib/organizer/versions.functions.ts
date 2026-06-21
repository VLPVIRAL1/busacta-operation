import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  captureTemplateSnapshotServer,
  listTemplateVersionsServer,
  restoreTemplateVersionServer,
} from "./versions.server";

export const captureTemplateSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        template_id: z.string().uuid(),
        note: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const version = await captureTemplateSnapshotServer({
      template_id: data.template_id,
      actor_id: context.userId,
      note: data.note ?? null,
    });
    return { version };
  });

export const listTemplateVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ template_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    return { versions: await listTemplateVersionsServer(data.template_id) };
  });

export const restoreTemplateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ version_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    return restoreTemplateVersionServer({
      version_id: data.version_id,
      actor_id: context.userId,
    });
  });
