import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCallerCanManagePayroll } from "./payroll.server";
import {
  listLeavePolicyTemplatesServer,
  upsertLeavePolicyTemplateServer,
  deleteLeavePolicyTemplateServer,
  toggleLeavePolicyActiveServer,
  applyLeavePolicyTemplateServer,
} from "./leave-policy-templates.server";

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  is_active: z.boolean().optional(),
  standard_start_time: z.string().optional(),
  standard_end_time: z.string().optional(),
  grace_period_minutes: z.number().nonnegative().optional(),
  early_checkout_grace_minutes: z.number().nonnegative().optional(),
  min_hours_full_day: z.number().nonnegative().optional(),
  min_hours_half_day: z.number().nonnegative().optional(),
  el_quota: z.number().nonnegative().optional(),
  cl_quota: z.number().nonnegative().optional(),
  sl_quota: z.number().nonnegative().optional(),
  el_carry_forward_max: z.number().nonnegative().optional(),
  cl_carry_forward_max: z.number().nonnegative().optional(),
  sl_carry_forward_max: z.number().nonnegative().optional(),
  opening_balance_date: z.string().nullable().optional(),
  el_opening_balance: z.number().nonnegative().optional(),
  cl_opening_balance: z.number().nonnegative().optional(),
  sl_opening_balance: z.number().nonnegative().optional(),
});

export const listLeavePolicyTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }: { context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return listLeavePolicyTemplatesServer();
  });

export const upsertLeavePolicyTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => templateSchema.parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return upsertLeavePolicyTemplateServer(data, context.userId);
  });

export const deleteLeavePolicyTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return deleteLeavePolicyTemplateServer(data.id);
  });

export const toggleLeavePolicyActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return toggleLeavePolicyActiveServer(data.id, data.is_active);
  });

export const applyLeavePolicyTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        template_id: z.string().uuid(),
        employee_ids: z.array(z.string().uuid()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return applyLeavePolicyTemplateServer(data.template_id, data.employee_ids, context.userId);
  });
