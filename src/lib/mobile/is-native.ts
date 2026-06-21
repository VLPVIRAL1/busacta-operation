// Lightweight detection — avoids importing @capacitor/core in the web bundle.
// Capacitor injects a global `Capacitor` object into the WebView at runtime.
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => "ios" | "android" | "web";
    };
  }
}

export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  return window.Capacitor?.getPlatform?.() ?? "web";
}
