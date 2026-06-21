/**
 * Public cron endpoint — daily organizer due-soon scan.
 *
 * Authentication: callers MUST send `apikey: <SUPABASE_PUBLISHABLE_KEY>` OR
 * `x-cron-secret: <CRON_SECRET>` (when configured). The pg_cron job in
 * Supabase sends both when available.
 */
import { createFileRoute } from "@tanstack/react-router";
import { runDueSoonScanServer } from "@/lib/organizer/due-soon.server";

export const Route = createFileRoute("/api/public/organizer-due-soon-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const cronSecret = request.headers.get("x-cron-secret");
        const validKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        const validSecret = process.env.CRON_SECRET;
        const ok = (validKey && apiKey === validKey) || (validSecret && cronSecret === validSecret);
        if (!ok) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runDueSoonScanServer();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
