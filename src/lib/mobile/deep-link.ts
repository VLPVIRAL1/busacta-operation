import { isNative } from "./is-native";

/**
 * Handle `busacta://` deep links + Universal/App Links.
 * - busacta://auth-callback#access_token=... → hand to Supabase via window hash
 * - busacta://route/<path> → navigate inside the app
 * - https://one.busacta.com/<path> → just navigate
 */
export async function installDeepLinkHandler(): Promise<void> {
  if (!isNative()) return;
  try {
    const { App } = await import(/* @vite-ignore */ "@capacitor/app" as any);
    App.addListener("appUrlOpen", (event: { url: string }) => {
      try {
        const u = new URL(event.url);
        if (u.protocol === "busacta:") {
          if (u.host === "auth-callback") {
            // Forward the hash so supabase-js picks up the access_token.
            window.location.hash = u.hash || "";
            return;
          }
          if (u.host === "route") {
            window.location.assign(u.pathname || "/");
            return;
          }
        }
        // Universal link → strip origin, navigate to path
        window.location.assign(u.pathname + u.search + u.hash);
      } catch {
        /* ignore malformed link */
      }
    });
  } catch (err) {
    console.warn("[deep-link] handler not installed:", err);
  }
}
