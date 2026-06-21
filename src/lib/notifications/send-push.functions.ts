import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Stub push dispatcher.
 *
 * Credentials bypass mode: until FCM (Android) and APNs (iOS) credentials are
 * wired up, this function logs the intended push payload to the server console
 * and resolves successfully. The realtime in-app notification channel
 * (`notif-<userId>`) still fires — only the OS-level native banner is skipped.
 *
 * To go live later: replace the `dispatchToProvider` body with real FCM / APNs
 * HTTP calls using tokens read from `device_push_tokens`.
 */
export const sendPushToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(500),
        data: z.record(z.string(), z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: tokens, error } = await supabase
      .from("device_push_tokens")
      .select("platform, token")
      .eq("user_id", data.userId);

    if (error) {
      console.error("[push] token lookup failed", error);
      return { ok: false, delivered: 0, stubbed: true };
    }

    const targets = tokens ?? [];

    // STUB: log instead of calling FCM / APNs.
    console.log("[push:stub] would dispatch", {
      userId: data.userId,
      title: data.title,
      body: data.body,
      data: data.data ?? {},
      deviceCount: targets.length,
      platforms: targets.map((t) => t.platform),
    });

    return {
      ok: true,
      delivered: targets.length,
      stubbed: true,
    };
  });
