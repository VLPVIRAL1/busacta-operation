import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getResponseHistoryServer } from "./history.server";

async function assertCanManage(supabase: ReturnType<typeof Object>, userId: string) {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("can_manage_organizer", {
    _user_id: userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not authorized");
}

export const getResponseHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        deployment_id: z.string().uuid(),
        block_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    const history = await getResponseHistoryServer(data);
    return { history };
  });
