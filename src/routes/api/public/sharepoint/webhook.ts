// Microsoft Graph SharePoint change-notification webhook.
// Graph calls this endpoint when files are created/updated/deleted in a subscribed drive.
//
// Flow:
//   1. Validation handshake (GET ?validationToken=…) — echo token back as text/plain
//   2. Change notification (POST) — extract projectId from clientState, queue delta_sync_drive,
//      return 202 immediately (Graph requires a response within 3 s)
//
// The clientState format is "busacta-drive-{projectId}" — set when the subscription is created
// in createOrRenewDriveSubscription (handlers.server.ts).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sharepoint/webhook")({
  server: {
    handlers: {
      // Microsoft Graph subscription validation handshake.
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("validationToken");
        if (token) {
          return new Response(token, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response("ok", { status: 200 });
      },

      // Change notification delivery.
      // Must respond < 3 s — queue the job and 202 immediately; delta sync runs async.
      POST: async ({ request }) => {
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const notifications =
          (body as { value?: Array<{ clientState?: string }> } | null)?.value ?? [];

        const projectIds = new Set<string>();
        for (const n of notifications) {
          const cs = n.clientState ?? "";
          if (cs.startsWith("busacta-drive-")) {
            projectIds.add(cs.slice("busacta-drive-".length));
          }
        }

        if (projectIds.size > 0) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          for (const projectId of projectIds) {
            // Validate the projectId corresponds to a real project with an active
            // SharePoint subscription before enqueuing. This prevents unauthenticated
            // callers from flooding the job queue with arbitrary project IDs.
            const { data: proj } = await supabaseAdmin
              .from("projects")
              .select("id")
              .eq("id", projectId)
              .not("sharepoint_drive_id", "is", null)
              .maybeSingle();

            if (!proj) continue; // unknown / unprovisioned project — ignore

            // Idempotent upsert — correlation_id prevents duplicate jobs if Graph retries
            await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
              {
                job_type: "delta_sync_drive",
                payload: { project_id: projectId },
                status: "queued",
                attempts: 0,
                max_attempts: 3,
                next_run_at: new Date().toISOString(),
                correlation_id: `delta-sync:${projectId}`,
              } as never,
              { onConflict: "correlation_id", ignoreDuplicates: true } as never,
            );
          }
        }

        return new Response(null, { status: 202 });
      },
    },
  },
});
