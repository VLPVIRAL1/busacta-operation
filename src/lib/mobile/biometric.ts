import { isNative } from "./is-native";

const LAST_ACTIVE_KEY = "busacta:last-active";
const REAUTH_AFTER_MS = 5 * 60 * 1000; // 5 min background → require biometric

export function markActive() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
}

export function needsBiometricReauth(): boolean {
  if (!isNative() || typeof localStorage === "undefined") return false;
  const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
  return last > 0 && Date.now() - last > REAUTH_AFTER_MS;
}

/**
 * Prompt the OS biometric sheet. Resolves true on success, false on cancel/fail.
 * On web (or if the plugin is missing), resolves true so flow is not blocked.
 */
export async function promptBiometric(reason = "Unlock BusAcTa Operations"): Promise<boolean> {
  if (!isNative()) return true;
  try {
    // Resolved at runtime only on native; hidden from Vite's static analyzer.
    const pkg = ["@capacitor-community", "biometric-auth"].join("/");
    const mod: any = await import(/* @vite-ignore */ pkg);
    const Biometric = mod.BiometricAuth ?? mod.default ?? mod;
    const result = await Biometric.authenticate({
      reason,
      cancelTitle: "Use password",
      fallbackTitle: "Use password",
      iosFallbackTitle: "Use password",
      androidTitle: "BusAcTa Operations",
      androidSubtitle: reason,
    });
    return Boolean(result?.isAuthenticated ?? result?.success ?? true);
  } catch {
    return false;
  }
}
