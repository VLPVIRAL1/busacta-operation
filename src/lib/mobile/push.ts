/**
 * Push notification bootstrap for the Capacitor shell.
 * Registers the device with FCM (Android) / APNs (iOS) and persists the token
 * to `public.device_push_tokens` so the server can fan out alerts that match
 * the existing `notif-<userId>` realtime topic.
 *
 * Safe to call from web — exits early when not running inside Capacitor.
 */
import { isNative, nativePlatform } from "./is-native";
import { supabase } from "@/integrations/supabase/client";

let registered = false;

export async function registerPushForCurrentUser(userId: string): Promise<void> {
  if (!isNative() || registered) return;
  registered = true;

  try {
    const { PushNotifications } = await import(
      /* @vite-ignore */ "@capacitor/push-notifications" as any
    );

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      if (req.receive !== "granted") return;
    }

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token: { value: string }) => {
      await (supabase as any).from("device_push_tokens").upsert(
        {
          user_id: userId,
          platform: nativePlatform(),
          token: token.value,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      );
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (event: any) => {
      const url = event?.notification?.data?.url as string | undefined;
      if (url && typeof window !== "undefined") {
        window.location.assign(url);
      }
    });
  } catch (err) {
    // Plugin not installed in the running shell — quietly no-op.
    console.warn("[push] not available:", err);
  }
}
