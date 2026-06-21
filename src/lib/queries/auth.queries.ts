import { supabase } from "@/integrations/supabase/client";

/**
 * Auth helpers — keep route/UI files out of the Supabase auth client.
 * Centralizing these lets us swap providers / add telemetry in one spot.
 */

export async function sendPasswordResetEmail(email: string, redirectTo: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function updateUserPassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export async function updateUserEmail(email: string) {
  return supabase.auth.updateUser({ email });
}

export async function getCurrentSession() {
  return supabase.auth.getSession();
}

export async function getCurrentUser() {
  return supabase.auth.getUser();
}

export async function signOut() {
  return supabase.auth.signOut();
}
