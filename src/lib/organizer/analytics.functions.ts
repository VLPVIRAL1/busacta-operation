import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getTemplateAnalyticsServer, listTemplatesWithStatsServer } from "./analytics.server";

async function assertCanManage(supabase: unknown, userId: string) {
  const client = supabase as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("can_manage_organizer", {
    _user_id: userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not authorized to view organizer analytics");
}

export const listTemplatesWithStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCanManage(context.supabase, context.userId);
    const templates = await listTemplatesWithStatsServer();
    return { templates };
  });

export const getTemplateAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ template_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    return getTemplateAnalyticsServer(data.template_id);
  });
