/**
 * Server-only transactional email sender — dual-provider.
 *
 * Looks up which provider is active in `integration_credentials`, then routes:
 *   • "smtp"   → Supabase Edge Function `send-email` (Deno, real TCP to SMTP host)
 *   • "resend" → Resend HTTPS API (CF Workers compatible, no TCP needed)
 *
 * Credentials for both providers are managed entirely from
 * Admin → Integration → Email (stored in the DB, no env vars needed).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const EDGE_FN_PATH = "/functions/v1/send-email";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** Optional per-send display-name override (e.g. a firm name). */
  fromName?: string | null;
  /** Optional Reply-To address. */
  replyTo?: string | null;
}

type ActiveProvider = {
  key: "smtp" | "resend";
  config: Record<string, unknown>;
};

async function getActiveProvider(): Promise<ActiveProvider | null> {
  const { data } = await supabaseAdmin
    .from("integration_credentials" as never)
    .select("integration_key, config")
    .in("integration_key" as never, ["smtp", "resend"])
    .eq("is_active" as never, true)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as { integration_key: string; config: Record<string, unknown> };
  if (row.integration_key !== "smtp" && row.integration_key !== "resend") return null;
  return { key: row.integration_key as "smtp" | "resend", config: row.config };
}

async function sendViaSmtp(input: SendEmailInput): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in environment.");
  }
  const to = Array.isArray(input.to) ? input.to.join(", ") : input.to;
  const res = await fetch(`${supabaseUrl}${EDGE_FN_PATH}`, {
    method: "POST",
    headers: { authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      to,
      subject: input.subject,
      html: input.html,
      ...(input.fromName?.trim() ? { from_name: input.fromName.trim() } : {}),
      ...(input.replyTo?.trim() ? { reply_to: input.replyTo.trim() } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try { detail = (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* raw */ }
    throw new Error(detail || `SMTP relay failed (${res.status})`);
  }
}

async function sendViaResend(
  input: SendEmailInput,
  cfg: Record<string, unknown>,
): Promise<void> {
  const apiKey = (cfg.api_key as string | undefined)?.trim();
  if (!apiKey) {
    throw new Error(
      "Resend API key not configured. Go to Admin → Integration → Email to add it.",
    );
  }
  const fromEmail = (cfg.from_email as string | undefined)?.trim();
  if (!fromEmail) {
    throw new Error("Resend 'From' address not configured. Go to Admin → Integration → Email.");
  }
  const displayName = (
    input.fromName?.trim() || (cfg.from_name as string | undefined)?.trim() || ""
  );
  const from = displayName ? `${displayName} <${fromEmail}>` : fromEmail;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.replyTo?.trim() ? { reply_to: input.replyTo.trim() } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try { detail = (JSON.parse(text) as { message?: string; error?: string }).message ?? (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* raw */ }
    throw new Error(detail || `Resend delivery failed (${res.status})`);
  }
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const provider = await getActiveProvider();

  if (!provider) {
    throw new Error(
      "No email provider is active. Go to Admin → Integration → Email to configure SMTP or Resend.",
    );
  }

  if (provider.key === "resend") {
    return sendViaResend(input, provider.config);
  }
  return sendViaSmtp(input);
}
