import { createFileRoute } from "@tanstack/react-router";
import { runReminderSweep } from "@/lib/esign/reminders.server";

/**
 * Cron sweep: re-send signing links for active envelopes whose
 * `last_reminder_at + reminder_cadence_hours` has elapsed.
 *
 * Auth: `x-cron-secret` must match `process.env.CRON_SECRET` (project rule).
 */
export const Route = createFileRoute("/api/public/cron/esign-reminders")({
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

        const origin = new URL(request.url).origin;
        try {
          const result = await runReminderSweep(origin);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
