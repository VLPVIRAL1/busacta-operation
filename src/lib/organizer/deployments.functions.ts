import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { targetTypeSchema } from "./schemas";
import {
  createDeploymentServer,
  getDeploymentForRespondentServer,
  listMyDeploymentsServer,
  saveResponseServer,
  submitDeploymentServer,
} from "./deployments.server";

export const createDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        template_id: z.string().uuid(),
        target_type: targetTypeSchema,
        target_id: z.string().uuid(),
        assignee_profile_id: z.string().uuid(),
        due_at: z.string().datetime().nullable().optional(),
        firm_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const deployment = await createDeploymentServer({
      ...data,
      assigned_by: context.userId,
    });
    return { deployment };
  });

export const getDeploymentForRespondent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    return getDeploymentForRespondentServer(data.id);
  });

export const saveResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        deployment_id: z.string().uuid(),
        block_id: z.string().uuid(),
        value_json: z.unknown().nullable(),
        last_visited_block_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const response = await saveResponseServer({
      deployment_id: data.deployment_id,
      block_id: data.block_id,
      value_json: (data.value_json ?? null) as never,
      answered_by: context.userId,
      last_visited_block_id: data.last_visited_block_id,
    });
    return { response };
  });

export const submitDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const deployment = await submitDeploymentServer({
      deployment_id: data.id,
      actor_id: context.userId,
    });
    return { deployment };
  });

export const listMyDeployments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const deployments = await listMyDeploymentsServer(context.userId);
    return { deployments };
  });
