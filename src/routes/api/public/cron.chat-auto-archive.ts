import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Cron: invoke `run_chat_auto_archive` to archive idle chat threads and tasks
 * per each user's `comm_auto_archive_*` profile preferences.
 *
 * Schedule via pg_cron (hourly recommended), passing the shared secret in the
 * `x-cron-secret` header. Mirrors the security pattern of other public crons.
 */
export const Route = createFileRoute("/api/public/cron/chat-auto-archive")({
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

        const { data, error } = await supabaseAdmin.rpc("run_chat_auto_archive");
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        return Response.json({ ok: true, archived: data ?? 0 });
      },
    },
  },
});
