import { supabase } from "@/integrations/supabase/client";

const APP_MFA_VERIFIED_PREFIX = "app-mfa-verified:";

function storageKey(userId: string) {
  return `${APP_MFA_VERIFIED_PREFIX}${userId}`;
}

export function hasAppMfaVerified(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  return sessionStorage.getItem(storageKey(userId)) === "true";
}

export function markAppMfaVerified(userId: string | null | undefined) {
  if (!userId || typeof window === "undefined") return;
  sessionStorage.setItem(storageKey(userId), "true");
  window.dispatchEvent(new CustomEvent("app-mfa-verified", { detail: { userId } }));
}

export function clearAppMfaVerification(userId?: string | null) {
  if (typeof window === "undefined") return;
  if (userId) {
    sessionStorage.removeItem(storageKey(userId));
    return;
  }
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(APP_MFA_VERIFIED_PREFIX)) sessionStorage.removeItem(key);
  }
}

export async function getSecondFactorRequirement(
  userId: string,
): Promise<{ required: boolean; reason: "totp" | "otp" | "check_failed" | null }> {
  if (hasAppMfaVerified(userId)) return { required: false, reason: null };

  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
      return { required: true, reason: "totp" };
    }

    const { data, error } = await supabase
      .from("user_otp_channels")
      .select("id")
      .eq("user_id", userId)
      .not("verified_at", "is", null)
      .limit(1);

    if (error) {
      console.warn("Failed to check OTP channel requirement", error);
      return { required: true, reason: "check_failed" };
    }

    return { required: (data ?? []).length > 0, reason: (data ?? []).length > 0 ? "otp" : null };
  } catch (error) {
    console.warn("Failed to check second-factor requirement", error);
    return { required: true, reason: "check_failed" };
  }
}
