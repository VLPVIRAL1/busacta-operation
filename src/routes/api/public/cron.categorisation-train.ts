import { createFileRoute } from "@tanstack/react-router";
import { runScheduledTrainingTick } from "@/lib/ops/categorisation-training.server";

/**
 * Scheduled retrain tick for the local document classifier. A pg_cron job hits
 * this every 15 minutes; the handler decides whether a retrain is actually due
 * based on the admin-configured schedule in app_settings ('categorisation_training').
 * Protected by the x-cron-secret header.
 */
export const Route = createFileRoute("/api/public/cron/categorisation-train")({
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
          const result = await runScheduledTrainingTick();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});
