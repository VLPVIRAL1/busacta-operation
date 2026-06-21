import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCallerCanManageHr } from "./employees.server";
import { resendEmployeeInviteServer, generateTempPasswordServer } from "./invites.server";

const schema = z.object({
  profileId: z.string().uuid(),
  kind: z.enum(["invite", "recovery"]),
});

export const resendEmployeeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return resendEmployeeInviteServer({
      profileId: data.profileId,
      kind: data.kind,
      actorId: context.userId,
    });
  });

const tempPwSchema = z.object({ profileId: z.string().uuid() });

export const generateTempPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tempPwSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return generateTempPasswordServer({ profileId: data.profileId, actorId: context.userId });
  });
