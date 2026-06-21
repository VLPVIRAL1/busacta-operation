import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPortalUserServer } from "./portal-users.server";

export const createPortalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      contactId: string;
      email: string;
      password: string;
      fullName?: string | null;
      stream?: "cpa" | "direct";
    }) => data,
  )
  .handler(async ({ data, context }) => {
    // Only admins/employees may provision portal users.
    const { supabase, userId } = context;
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) throw error;
    const ok = (roles ?? []).some((r: any) =>
      ["admin", "super_admin", "employee"].includes(r.role),
    );
    if (!ok) throw new Error("Not authorized");
    return createPortalUserServer(data);
  });
