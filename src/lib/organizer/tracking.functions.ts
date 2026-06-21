import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deploymentStatusSchema, targetTypeSchema } from "./schemas";
import {
  gradeDeploymentServer,
  getDeploymentForReviewServer,
  listAllDeploymentsServer,
  returnDeploymentServer,
  updateDeploymentAssignmentServer,
} from "./tracking.server";

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

export const listAllDeployments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: deploymentStatusSchema.nullable().optional(),
        template_id: z.string().uuid().nullable().optional(),
        target_type: targetTypeSchema.nullable().optional(),
        search: z.string().trim().max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    const deployments = await listAllDeploymentsServer({
      status: data.status ?? null,
      template_id: data.template_id ?? null,
      target_type: data.target_type ?? null,
      search: data.search ?? null,
    });
    return { deployments };
  });

export const getDeploymentForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    return getDeploymentForReviewServer(data.id);
  });

const perBlockScoreSchema = z.array(
  z.object({
    block_id: z.string().uuid(),
    earned: z.number().min(0),
    possible: z.number().min(0),
    is_correct: z.boolean().nullable().optional(),
    reviewer_note: z.string().trim().max(2000).nullable().optional(),
  }),
);

export const gradeDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        score: z.number().min(0).max(100000),
        breakdown: z.record(z.string(), z.unknown()).default({}),
        notes: z.string().trim().max(4000).nullable().optional(),
        per_block: perBlockScoreSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    const deployment = await gradeDeploymentServer({
      deployment_id: data.id,
      actor_id: context.userId,
      score: data.score,
      breakdown: data.breakdown as never,
      notes: data.notes ?? null,
      per_block: data.per_block,
    });
    return { deployment };
  });

export const returnDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        notes: z.string().trim().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    const deployment = await returnDeploymentServer({
      deployment_id: data.id,
      actor_id: context.userId,
      notes: data.notes ?? null,
    });
    return { deployment };
  });

const assignmentStatusSchema = z.union([deploymentStatusSchema, z.literal("cancelled")]);

export const updateDeploymentAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        assignee_profile_id: z.string().uuid().optional(),
        due_at: z.string().datetime().nullable().optional(),
        status: assignmentStatusSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, context.userId);
    const deployment = await updateDeploymentAssignmentServer({
      deployment_id: data.id,
      actor_id: context.userId,
      assignee_profile_id: data.assignee_profile_id,
      due_at: data.due_at,
      status: data.status,
    });
    return { deployment };
  });
