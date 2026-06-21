import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Meta sends GET to verify the webhook endpoint during setup.
// It expects us to echo back hub.challenge if the verify token matches.
async function handleVerification(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return new Response("Server not configured", { status: 503 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// Incoming message / status-update payload from Meta.
type MetaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  timestamp: string;
};

type MetaWebhookPayload = {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string };
        messages?: MetaMessage[];
        statuses?: Array<{ id: string; status: string; recipient_id: string }>;
      };
      field?: string;
    }>;
  }>;
};

async function handleIncoming(request: Request): Promise<Response> {
  let body: MetaWebhookPayload;
  try {
    body = (await request.json()) as MetaWebhookPayload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "whatsapp_business_account") {
    return Response.json({ ok: true });
  }

  const changes = body.entry?.flatMap((e) => e.changes ?? []) ?? [];

  for (const change of changes) {
    const value = change.value;
    if (!value) continue;

    // Process inbound text messages — log them to whatsapp_inbound_messages
    const messages = value.messages ?? [];
    for (const msg of messages) {
      if (msg.type !== "text" || !msg.text?.body) continue;

      await supabaseAdmin
        .from("whatsapp_inbound_messages" as never)
        .insert({
          meta_message_id: msg.id,
          from_number: msg.from,
          body: msg.text.body,
          received_at: new Date(Number(msg.timestamp) * 1000).toISOString(),
        } as never)
        .then(({ error }) => {
          if (error && !error.message.includes("duplicate")) {
            console.error("[whatsapp webhook] insert error:", error.message);
          }
        });
    }
  }

  // Meta requires a 200 response within 20 s or it retries.
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: ({ request }) => handleVerification(request),
      POST: ({ request }) => handleIncoming(request),
    },
  },
});
