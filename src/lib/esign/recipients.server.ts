import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RecipientInput } from "./schemas";

const PALETTE = [
  "#4f46e5",
  "#0891b2",
  "#16a34a",
  "#ca8a04",
  "#dc2626",
  "#db2777",
  "#7c3aed",
  "#0f766e",
];

export async function upsertRecipientsServer(envelopeId: string, recipients: RecipientInput[]) {
  // Guard: only mutate while draft.
  const { data: env, error: envErr } = await supabaseAdmin
    .from("esign_envelopes")
    .select("status")
    .eq("id", envelopeId)
    .maybeSingle();
  if (envErr) throw new Error(envErr.message);
  if (!env) throw new Error("Envelope not found");
  if (env.status !== "draft") {
    throw new Error("Recipients can only be edited while envelope is a draft");
  }

  // Dedupe by email (case-insensitive).
  const seen = new Set<string>();
  for (const r of recipients) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate recipient email: ${r.email}`);
    }
    seen.add(key);
  }

  // Replace all recipients in this envelope. Fields cascade-delete.
  const { error: delErr } = await supabaseAdmin
    .from("esign_recipients")
    .delete()
    .eq("envelope_id", envelopeId);
  if (delErr) throw new Error(delErr.message);

  if (recipients.length === 0) return { ids: [] };

  const rows = recipients.map((r, idx) => ({
    envelope_id: envelopeId,
    full_name: r.full_name,
    email: r.email.toLowerCase(),
    role: r.role,
    auth_method: r.auth_method,
    routing_order: r.routing_order ?? idx + 1,
    phone_e164: r.phone_e164 ?? null,
    color_hex: r.color_hex ?? PALETTE[idx % PALETTE.length],
  }));

  const { data, error } = await supabaseAdmin.from("esign_recipients").insert(rows).select("id");
  if (error) throw new Error(error.message);

  return { ids: (data ?? []).map((r) => r.id) };
}
