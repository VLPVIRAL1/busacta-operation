// Microsoft Graph push webhook.
// Phase 2: accepts the validation handshake and ACKs notifications fast.
// A full async drain (look up account by subscription, run incremental
// delta) lands in Phase 7 ops hardening together with subscription
// renewal. For now this endpoint just keeps Graph happy if subscriptions
// are created out-of-band.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/email/webhooks/microsoft")({
  server: {
    handlers: {
      // Microsoft Graph subscription validation handshake.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("validationToken");
        if (token) {
          return new Response(token, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response("ok", { status: 200 });
      },
      // Notification delivery. We must respond < 3s, so we only verify
      // the shared clientState and 202 immediately; the periodic sync
      // job will pick up changes.
      POST: async ({ request }) => {
        const expected = process.env.MS_GRAPH_WEBHOOK_CLIENT_STATE;
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (expected) {
          const value = (body as { value?: { clientState?: string }[] } | null)?.value;
          const ok = Array.isArray(value) && value.every((v) => v?.clientState === expected);
          if (!ok) return new Response("Invalid clientState", { status: 401 });
        }
        // Acknowledge — actual sync runs via the pg_cron-driven drain.
        return new Response(null, { status: 202 });
      },
    },
  },
});
