import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updateWeeklyCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        weeklyCapacityHours: z.number().int().min(1).max(168),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("profiles")
      .update({ weekly_capacity_hours: data.weeklyCapacityHours })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
