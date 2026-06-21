import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncAccountById } from "./sync.server";

/** Trigger a sync for an account owned by the caller. Verifies ownership
 *  via the user-scoped client before delegating to the admin-scoped sync
 *  engine (which needs to bypass RLS to update token columns). */
export const syncAccountNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string; fullBootstrap?: boolean }) =>
    z
      .object({
        accountId: z.string().uuid(),
        fullBootstrap: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: owned, error } = await supabase
      .from("connected_email_accounts")
      .select("id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!owned) throw new Error("Account not found or not owned by you.");

    const result = await syncAccountById(data.accountId, !!data.fullBootstrap);
    return result;
  });
