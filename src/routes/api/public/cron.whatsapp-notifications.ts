import { createFileRoute } from "@tanstack/react-router";
import {
  processNotificationQueue,
  enqueueDueSoonNotifications,
} from "@/lib/whatsapp/notifications.server";

/**
 * Cron sweep: process the WhatsApp notification queue and enqueue
 * due-soon / overdue task reminders.
 *
 * Auth: `x-cron-secret` must match `process.env.CRON_SECRET`.
 * Schedule: every 5–15 minutes for queue delivery; daily is fine for due-soon.
 */
export const Route = createFileRoute("/api/public/cron/whatsapp-notifications")({
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
          const [queueResult, dueSoonResult] = await Promise.all([
            processNotificationQueue(200),
            enqueueDueSoonNotifications(2),
          ]);
          return Response.json({
            ok: true,
            queue: queueResult,
            due_soon_queued: dueSoonResult.queued,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
