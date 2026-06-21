import { createFileRoute } from "@tanstack/react-router";
import { runExpirySweep } from "@/lib/esign/reminders.server";

/**
 * Cron sweep: move `sent` / `in_progress` envelopes past `expires_at` to
 * `expired` and log `envelope_expired`.
 *
 * Auth: `x-cron-secret` must match `process.env.CRON_SECRET` (project rule).
 */
export const Route = createFileRoute("/api/public/cron/esign-expire")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (!expected) {
          return Response.json({ ok: false, error: "Server not configured" }, { status: 503 });
        }
        const provided = request.headers.get("x-cron-secret");
        if (!provided || provided !== expected) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        try {
          const result = await runExpirySweep();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
