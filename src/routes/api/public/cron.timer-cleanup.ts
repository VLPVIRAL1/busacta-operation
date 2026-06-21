import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Cron: close any time_log rows that have been running for more than 12 hours
 * (i.e. ended_at IS NULL and started_at < now - 12h). This handles the case
 * where a user starts a timer, then closes their browser / gets logged out
 * without stopping it — the recovery UI (`TimerRecoveryPrompt`) catches these
 * on re-login, but this cron ensures the database is cleaned up server-side.
 *
 * Schedule: run hourly via pg_cron or an external scheduler.
 * Security: requires the `x-cron-secret` header matching the `CRON_SECRET` env var.
 */
export const Route = createFileRoute("/api/public/cron/timer-cleanup")({
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

        const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabaseAdmin
          .from("time_logs")
          .update({
            ended_at: cutoff,
            duration_minutes: 0,
            // Flag that this was auto-closed by the server so the UI can inform the user.
            note: "[Auto-closed: timer ran for more than 12 hours]",
          })
          .is("ended_at", null)
          .lt("started_at", cutoff)
          .select("id");

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        return Response.json({ ok: true, closed: (data ?? []).length });
      },
    },
  },
});
