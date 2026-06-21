import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ActiveDeviceDTO = {
  device_id: string;
  label: string | null;
  user_agent: string | null;
  last_seen_at: string;
  last_ip: string | null;
  last_chosen_at: string | null;
};

export const refreshActiveDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("user_devices")
      .select("device_id,label,user_agent,last_seen_at,last_ip,last_chosen_at")
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    const devices = (data ?? []) as ActiveDeviceDTO[];
    // Default: previously chosen session, else the OLDEST active session.
    let defaultPickedId: string | null = null;
    const chosen = devices
      .filter((d) => d.last_chosen_at)
      .sort((a, b) => (b.last_chosen_at! < a.last_chosen_at! ? -1 : 1))[0];
    if (chosen) {
      defaultPickedId = chosen.device_id;
    } else if (devices.length > 0) {
      const oldest = [...devices].sort((a, b) => (a.last_seen_at < b.last_seen_at ? -1 : 1))[0];
      defaultPickedId = oldest.device_id;
    }
    return { devices, defaultPickedId };
  });

export const markDeviceChosen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ deviceId: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("mark_device_chosen", {
      _device_id: data.deviceId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const revokeOtherDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ keepDeviceId: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: count, error } = await supabase.rpc("revoke_other_devices", {
      _keep_device_id: data.keepDeviceId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, revoked: (count as number | null) ?? 0 };
  });
