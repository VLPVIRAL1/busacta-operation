// Cron dispatcher for auto-categorisation.
// Polls task_attachments for pending docs and dispatches the
// categorise-document Edge Function in fire-and-forget mode.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BATCH_SIZE = 5;
const STALE_MINUTES = 10;

async function recoverStaleProcessing(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("task_attachments" as never)
    .update({
      categorisation_status: "pending",
      categorisation_started_at: null,
    } as never)
    .eq("categorisation_status", "processing")
    .lt("categorisation_started_at", cutoff)
    .select("id");
  return (data as any[])?.length ?? 0;
}

export const Route = createFileRoute(
  "/api/public/cron/categorise-pending",
)({
  server: {
    handlers: {
      POST: async ({ request, context }: { request: Request; context: any }) => {
        const provided = request.headers.get("x-cron-secret");
        const expected = process.env.CRON_SECRET;
        if (!expected) {
          return new Response("CRON_SECRET not configured", { status: 500 });
        }
        if (!provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Recover any docs stuck in 'processing' for too long
        const recovered = await recoverStaleProcessing();

        // Claim a batch of pending docs
        const { data: pending, error } = await supabaseAdmin
          .from("task_attachments" as never)
          .select("id, storage_path, filename, mime_type")
          .eq("categorisation_status", "pending")
          .limit(BATCH_SIZE);

        if (error) {
          return new Response(`DB error: ${error.message}`, { status: 500 });
        }

        const list = (pending ?? []) as Array<{
          id: string;
          storage_path: string;
          filename: string;
          mime_type: string | null;
        }>;

        if (!list.length) {
          return Response.json({ ok: true, processed: 0, recovered });
        }

        const ids = list.map((d) => d.id);
        await supabaseAdmin
          .from("task_attachments" as never)
          .update({
            categorisation_status: "processing",
            categorisation_started_at: new Date().toISOString(),
          } as never)
          .in("id", ids);

        // Fire-and-forget: dispatch each doc to the Edge Function.
        // DO NOT await — the cron must return in < 30s.
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const fnUrl = `${supabaseUrl}/functions/v1/categorise-document`;

        const waitUntil =
          (context as any)?.cloudflare?.ctx?.waitUntil?.bind(
            (context as any)?.cloudflare?.ctx,
          ) as ((p: Promise<unknown>) => void) | undefined;

        for (const doc of list) {
          const dispatch = fetch(fnUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              docId: doc.id,
              storagePath: doc.storage_path,
              filename: doc.filename,
              mimeType: doc.mime_type,
            }),
          }).catch((err) => {
            console.error("categorise dispatch failed", doc.id, err);
          });

          if (waitUntil) {
            waitUntil(dispatch);
          }
        }

        return Response.json({
          ok: true,
          processed: list.length,
          recovered,
        });
      },
    },
  },
});
