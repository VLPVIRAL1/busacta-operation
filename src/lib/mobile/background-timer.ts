import { isNative } from "./is-native";

/**
 * Show a sticky local notification while a timer is running so iOS / Android
 * users see it in the lock screen and the OS keeps the WebView alive longer.
 * Cancelled when the timer stops.
 */
const NOTIFICATION_ID = 9911;

export async function startBackgroundTimerNotice(taskTitle: string): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import(
      /* @vite-ignore */ "@capacitor/local-notifications" as any
    );
    await LocalNotifications.requestPermissions();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: "BusAcTa timer running",
          body: taskTitle,
          ongoing: true,
          autoCancel: false,
        },
      ],
    });
  } catch (err) {
    console.warn("[bg-timer] notice failed:", err);
  }
}

export async function stopBackgroundTimerNotice(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import(
      /* @vite-ignore */ "@capacitor/local-notifications" as any
    );
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  } catch {
    /* no-op */
  }
}
