import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Daily cron: check whether the next quarterly access review is within 14 days.
 * If so, write an audit_log entry tagged "access_review_reminder" so admins
 * see it in /admin/compliance. (Email notifications can be layered on later.)
 */
export const Route = createFileRoute("/api/public/cron/access-review-check")({
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

        const { data: schedule, error } = await supabaseAdmin
          .from("access_review_schedule")
          .select("id, next_due_at, last_completed_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!schedule) return Response.json({ ok: true, skipped: "no_schedule" });

        const dueAt = new Date(schedule.next_due_at as string);
        const now = new Date();
        const daysUntil = Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000);

        if (daysUntil > 14) return Response.json({ ok: true, daysUntil, reminded: false });

        await supabaseAdmin.from("audit_log").insert({
          action: "access_review_reminder",
          resource_type: "access_review_schedule",
          resource_id: schedule.id as string,
          after: { next_due_at: schedule.next_due_at, days_until: daysUntil } as never,
        } as never);

        return Response.json({ ok: true, daysUntil, reminded: true });
      },
    },
  },
});
