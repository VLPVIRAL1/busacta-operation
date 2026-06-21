import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listMyPortalDeploymentsServer } from "./portal.server";

export const listMyPortalDeployments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = await listMyPortalDeploymentsServer(context.userId);
    return { deployments: rows };
  });
