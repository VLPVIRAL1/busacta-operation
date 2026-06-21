/**
 * Recognise Supabase / PostgREST errors caused by an expired or missing session.
 * Used by timer mutations so we can prompt the user to re-login instead of
 * surfacing a generic "couldn't stop timer" toast.
 */
export function isAuthExpiredError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  if (e.status === 401 || e.status === 403) return true;
  const msg = (e.message ?? "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("jwt expired") ||
    msg.includes("jwt is expired") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    msg.includes("not authenticated") ||
    msg.includes("session_not_found") ||
    msg.includes("auth session missing") ||
    msg.includes("token is expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("unauthorized")
  );
}

/** Quickly probe whether we currently hold a valid Supabase session. */
export async function hasLiveSession(): Promise<boolean> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    return !!data.session?.access_token;
  } catch {
    return false;
  }
}
