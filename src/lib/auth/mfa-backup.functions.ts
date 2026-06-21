import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateBackupCodesServer,
  consumeBackupCodeServer,
  getBackupCodeStatusServer,
} from "./mfa-backup.server";

export const generateMfaBackupCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return generateBackupCodesServer(context.userId);
  });

export const consumeMfaBackupCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data, context }) => {
    return consumeBackupCodeServer(context.userId, data.code);
  });

export const getMfaBackupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return getBackupCodeStatusServer(context.userId);
  });
