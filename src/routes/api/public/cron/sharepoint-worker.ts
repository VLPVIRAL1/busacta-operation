// SharePoint sync worker — polled by pg_cron / external scheduler.
// Phase 1: dispatches each queued job to the matching Graph handler.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadMicrosoftGraphConfig } from "@/lib/sharepoint/credentials.server";
import { dispatchJob } from "@/lib/sharepoint/handlers.server";

const BATCH_SIZE = 10;

// Job types that belong to the per-project backup Lists feature. Everything
// else that isn't a list job is part of the document-library sync feature.
const LIST_JOB_TYPES = new Set([
  "provision_project_lists",
  "backup_task",
  "backup_message",
  "backup_audit_event",
  "backup_document",
]);

type Job = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  firm_id: string | null;
};

export const Route = createFileRoute("/api/public/cron/sharepoint-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const expected = process.env.CRON_SECRET;
        if (!expected) {
          return new Response("CRON_SECRET not configured", { status: 500 });
        }
        if (!provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const cfg = await loadMicrosoftGraphConfig();
        if (!cfg) {
          return Response.json({
            ok: true,
            skipped: "Microsoft Graph integration not configured or disabled",
            processed: 0,
          });
        }

        const { data: jobs, error } = await supabaseAdmin
          .from("sharepoint_sync_jobs" as never)
          .select("id, job_type, payload, attempts, max_attempts, firm_id")
          .in("status", ["queued", "failed"])
          .lte("next_run_at", new Date().toISOString())
          .order("next_run_at", { ascending: true })
          .limit(BATCH_SIZE);

        if (error) {
          return new Response(`DB error: ${error.message}`, { status: 500 });
        }

        // Per-feature switches (absent = enabled). When a feature is off we leave
        // its jobs queued (untouched) so they resume automatically if re-enabled.
        const spEnabled = cfg.sharepoint_enabled !== false;
        const listsEnabled = cfg.sharepoint_lists_enabled !== false;

        const list = (jobs ?? []) as Job[];
        let processed = 0;
        let failed = 0;
        let skipped = 0;

        for (const job of list) {
          const isListJob = LIST_JOB_TYPES.has(job.job_type);
          if ((isListJob && !listsEnabled) || (!isListJob && !spEnabled)) {
            skipped++;
            continue; // feature disabled — leave the job queued for later
          }

          await supabaseAdmin
            .from("sharepoint_sync_jobs" as never)
            .update({ status: "running", attempts: job.attempts + 1 } as never)
            .eq("id", job.id);

          try {
            await dispatchJob(job);
            await supabaseAdmin
              .from("sharepoint_sync_jobs" as never)
              .update({ status: "succeeded", last_error: null } as never)
              .eq("id", job.id);
            processed++;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const nextAttempts = job.attempts + 1;
            const dead = nextAttempts >= job.max_attempts;
            const backoffMs = Math.min(60 * 60 * 1000, 2 ** nextAttempts * 60 * 1000);
            await supabaseAdmin
              .from("sharepoint_sync_jobs" as never)
              .update({
                status: dead ? "dead" : "failed",
                last_error: message,
                next_run_at: new Date(Date.now() + backoffMs).toISOString(),
              } as never)
              .eq("id", job.id);
            failed++;
          }
        }

        // Document-library background maintenance (auto delta-sync + subscription
        // renewal) only runs while the SharePoint document feature is enabled.
        if (spEnabled) {
          // Auto-enqueue delta_sync_drive for project drives not synced in the last 5 minutes.
          // This powers the two-way sync: files added directly in SharePoint appear in BusAcTa.
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: staleDrives } = await supabaseAdmin
            .from("projects")
            .select("id, firm_id")
            .not("sharepoint_drive_id", "is", null)
            .or(`sharepoint_last_synced_at.is.null,sharepoint_last_synced_at.lt.${fiveMinAgo}`);

          for (const proj of (staleDrives ?? []) as { id: string; firm_id: string | null }[]) {
            await supabaseAdmin.from("sharepoint_sync_jobs" as never).upsert(
              {
                job_type: "delta_sync_drive",
                firm_id: proj.firm_id,
                payload: { project_id: proj.id },
                status: "queued",
                attempts: 0,
                max_attempts: 3,
                next_run_at: new Date().toISOString(),
                correlation_id: `delta-sync:${proj.id}`,
              } as never,
              { onConflict: "correlation_id", ignoreDuplicates: true } as never,
            );
          }

          // Renew Graph change-notification subscriptions expiring within 3 days.
          // Graph subscriptions last at most 30 days; we renew at 3-day watermark.
          const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

          const { data: expiring } = (await (supabaseAdmin
            .from("projects" as never)
            .select("id, sharepoint_drive_id, sharepoint_subscription_id")
            .not("sharepoint_subscription_id", "is", null)
            .lt("sharepoint_subscription_expires_at", threeDaysFromNow) as any)) as {
            data:
              | { id: string; sharepoint_drive_id: string; sharepoint_subscription_id: string }[]
              | null;
            error: { message: string } | null;
          };

          for (const proj of (expiring ?? []) as {
            id: string;
            sharepoint_drive_id: string;
            sharepoint_subscription_id: string;
          }[]) {
            try {
              const { createOrRenewDriveSubscription } =
                await import("@/lib/sharepoint/handlers.server");
              await createOrRenewDriveSubscription(
                proj.id,
                proj.sharepoint_drive_id,
                proj.sharepoint_subscription_id,
              );
            } catch {
              /* log and continue — will retry on next cron run */
            }
          }
        }

        return Response.json({ ok: true, processed, failed, skipped, total: list.length });
      },
    },
  },
});
