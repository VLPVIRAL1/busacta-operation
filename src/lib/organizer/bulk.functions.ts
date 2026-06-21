import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { targetTypeSchema } from "./schemas";
import { createBulkDeploymentServer } from "./bulk.server";

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

export const createBulkDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        template_id: z.string().uuid(),
        target_type: targetTypeSchema,
        assignments: z
          .array(
            z.object({
              target_id: z.string().uuid(),
              assignee_profile_id: z.string().uuid(),
            }),
          )
          .min(1)
          .max(500),
        due_at: z.string().datetime().nullable().optional(),
        firm_id: z.string().uuid().nullable().optional(),
        note: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    return createBulkDeploymentServer({
      template_id: data.template_id,
      target_type: data.target_type,
      assignments: data.assignments,
      assigned_by: context.userId,
      due_at: data.due_at ?? null,
      firm_id: data.firm_id ?? null,
      note: data.note ?? null,
    });
  });
