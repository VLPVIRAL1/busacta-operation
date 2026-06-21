// Meta WhatsApp Cloud API client. Credentials are read from integration_credentials
// (key = 'meta_whatsapp') at call time so admin changes take effect immediately.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type WhatsAppConfig = {
  app_id: string;
  phone_number_id: string;
  access_token: string;
};

async function getConfig(): Promise<WhatsAppConfig> {
  const { data, error } = await supabaseAdmin
    .from("integration_credentials" as never)
    .select("config, is_active")
    .eq("integration_key", "meta_whatsapp")
    .maybeSingle();

  if (error) throw new Error(`WhatsApp config read failed: ${error.message}`);
  if (!data) throw new Error("WhatsApp is not configured. Set it up in Admin → WhatsApp.");

  const row = data as { config: Record<string, string>; is_active: boolean };
  if (!row.is_active) throw new Error("WhatsApp integration is disabled.");

  const { app_id, phone_number_id, access_token } = row.config ?? {};
  if (!phone_number_id || !access_token) {
    throw new Error("WhatsApp credentials are incomplete. Check Admin → WhatsApp.");
  }
  return { app_id: app_id ?? "", phone_number_id, access_token };
}

// Send a WhatsApp message via Meta Cloud API. `to` must be E.164 (e.g. +14155551234).
export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const cfg = await getConfig();

  const url = `https://graph.facebook.com/v19.0/${cfg.phone_number_id}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? res.statusText;
    throw new Error(`Meta WhatsApp send failed (${res.status}): ${msg}`);
  }
}

// Verify credentials by sending a test message. Returns ok or an error string.
export async function testWhatsAppConnection(
  testPhone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sendWhatsAppMessage(
      testPhone,
      "✅ BusAcTa Operations WhatsApp test message — connection is working.",
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
