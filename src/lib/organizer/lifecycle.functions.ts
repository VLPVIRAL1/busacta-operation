import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  cancelDeploymentServer,
  reopenDeploymentServer,
  sendReminderServer,
} from "./lifecycle.server";

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
  if (!data) throw new Error("Not authorized to manage organizers");
}

export const sendReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    return sendReminderServer({
      deployment_id: data.id,
      actor_id: context.userId,
    });
  });

export const reopenDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    return reopenDeploymentServer({ deployment_id: data.id });
  });

export const cancelDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    return cancelDeploymentServer({ deployment_id: data.id });
  });
