import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ConnectedAccount = {
  id: string;
  provider: "microsoft" | "google";
  email_address: string;
  display_name: string | null;
  sync_status: "idle" | "syncing" | "error" | "paused";
  sync_error: string | null;
  last_synced_at: string | null;
  is_active: boolean;
  created_at: string;
};

export const listConnectedAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("connected_email_accounts")
      .select(
        "id, provider, email_address, display_name, sync_status, sync_error, last_synced_at, is_active, created_at",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ConnectedAccount[];
  });

export const disconnectEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("connected_email_accounts")
      .delete()
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountId: string; isActive: boolean }) =>
    z.object({ accountId: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("connected_email_accounts")
      .update({ is_active: data.isActive })
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
