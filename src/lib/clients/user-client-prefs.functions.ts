import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StreamSchema = z.enum(["cpa", "direct"]);

export const listUserClientPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_client_prefs")
      .select("stream, client_id, pinned, sort_index")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      stream: "cpa" | "direct";
      client_id: string;
      pinned: boolean;
      sort_index: number;
    }>;
  });

export const togglePinClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        stream: StreamSchema,
        clientId: z.string().uuid(),
        pinned: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("user_client_prefs").upsert(
      {
        user_id: userId,
        stream: data.stream,
        client_id: data.clientId,
        pinned: data.pinned,
      },
      { onConflict: "user_id,stream,client_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        items: z
          .array(
            z.object({
              stream: StreamSchema,
              clientId: z.string().uuid(),
              sortIndex: z.number().int().min(0).max(100000),
            }),
          )
          .min(1)
          .max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = data.items.map((it) => ({
      user_id: userId,
      stream: it.stream,
      client_id: it.clientId,
      sort_index: it.sortIndex,
    }));
    const { error } = await supabase
      .from("user_client_prefs")
      .upsert(rows, { onConflict: "user_id,stream,client_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setClientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        stream: StreamSchema,
        clientId: z.string().uuid(),
        status: z.enum(["active", "archived", "deactivated"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const table = data.stream === "cpa" ? "firms" : "direct_clients";
    const { error } = await supabase
      .from(table)
      .update({ status: data.status })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        stream: StreamSchema,
        clientId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const table = data.stream === "cpa" ? "firms" : "direct_clients";
    const { error } = await supabase.from(table).delete().eq("id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
