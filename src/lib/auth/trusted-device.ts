// Trusted-device helpers for MFA "remember this browser" flow.
import { supabase } from "@/integrations/supabase/client";

const KEY = "mfa-trusted-device-id";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback (older browsers): rfc4122-ish
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function clearDeviceId() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}

export async function isTrustedDevice(): Promise<boolean> {
  const id = getOrCreateDeviceId();
  if (!id) return false;
  const { data, error } = await supabase.rpc("is_trusted_device", { _device_id: id });
  if (error) {
    console.warn("is_trusted_device check failed", error);
    return false;
  }
  return Boolean(data);
}

export async function registerTrustedDevice(days = 30): Promise<void> {
  const id = getOrCreateDeviceId();
  if (!id) return;
  const label = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : undefined;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
  const { error } = await supabase.rpc("register_trusted_device", {
    _device_id: id,
    _label: label,
    _days: days,
    _ua: ua,
  });
  if (error) console.warn("register_trusted_device failed", error);
}
