// Public telemetry ingestion endpoint for the BusAcTa Operations productivity tracker.
// Validates the bearer token, parses telemetry fields, optionally uploads a
// screenshot to storage, and records an activity_log row for the session.
import { createFileRoute } from "@tanstack/react-router";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export const Route = createFileRoute("/api/public/productivity/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Step 1 — Auth
        const authHeader = request.headers.get("Authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) {
          return Response.json(
            { error: "Missing authorization token" },
            { status: 401, headers: corsHeaders() },
          );
        }
        const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (authErr || !userData?.user?.id) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
        }
        const userId = userData.user.id;

        // Step 2 — Parse FormData
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json(
            { error: "Invalid form data" },
            { status: 400, headers: corsHeaders() },
          );
        }

        // Step 3 — Get and parse telemetry field
        const telemetryRaw = form.get("telemetry");
        if (typeof telemetryRaw !== "string" || !telemetryRaw) {
          return Response.json(
            { error: "Missing telemetry field" },
            { status: 400, headers: corsHeaders() },
          );
        }
        let telemetry: {
          session_id: unknown;
          keystrokes_count: unknown;
          mouse_clicks_count: unknown;
          active_window_title: unknown;
          active_application_name: unknown;
          interval_start: unknown;
          interval_end: unknown;
        };
        try {
          telemetry = JSON.parse(telemetryRaw);
        } catch {
          return Response.json(
            { error: "Invalid telemetry JSON" },
            { status: 400, headers: corsHeaders() },
          );
        }

        const {
          session_id,
          keystrokes_count,
          mouse_clicks_count,
          active_window_title,
          active_application_name,
          interval_start,
          interval_end,
        } = telemetry;

        // Step 4 — Validate
        if (typeof session_id !== "string" || !UUID_RE.test(session_id)) {
          return Response.json(
            { error: "Invalid session_id" },
            { status: 400, headers: corsHeaders() },
          );
        }
        if (typeof keystrokes_count !== "number" || keystrokes_count < 0) {
          return Response.json(
            { error: "Invalid keystrokes_count" },
            { status: 400, headers: corsHeaders() },
          );
        }
        if (typeof mouse_clicks_count !== "number" || mouse_clicks_count < 0) {
          return Response.json(
            { error: "Invalid mouse_clicks_count" },
            { status: 400, headers: corsHeaders() },
          );
        }
        const startDate = new Date(interval_start as string);
        const endDate = new Date(interval_end as string);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return Response.json(
            { error: "Invalid interval dates" },
            { status: 400, headers: corsHeaders() },
          );
        }
        if (endDate.getTime() <= startDate.getTime()) {
          return Response.json(
            { error: "interval_end must be after interval_start" },
            { status: 400, headers: corsHeaders() },
          );
        }

        // Step 5 — Verify session ownership
        const { data: session, error: sessionErr } = await supabaseAdmin
          .from("productivity_sessions")
          .select("id")
          .eq("id", session_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (sessionErr) {
          return Response.json(
            { error: sessionErr.message },
            { status: 500, headers: corsHeaders() },
          );
        }
        if (!session) {
          return Response.json(
            { error: "Session not found" },
            { status: 404, headers: corsHeaders() },
          );
        }

        // Step 6 — Handle optional screenshot upload
        let screenshotPath: string | null = null;
        const screenshotField = form.get("screenshot");
        if (screenshotField instanceof File && screenshotField.size > 0) {
          if (screenshotField.size > MAX_SCREENSHOT_BYTES) {
            return Response.json(
              { error: "Screenshot too large (max 3 MB)" },
              { status: 413, headers: corsHeaders() },
            );
          }
          const ext = ALLOWED_MIME[screenshotField.type];
          if (!ext) {
            return Response.json(
              { error: "Screenshot must be jpeg, png, or webp" },
              { status: 415, headers: corsHeaders() },
            );
          }
          const storagePath = `${userId}/${session_id}/${crypto.randomUUID()}.${ext}`;
          const buffer = await screenshotField.arrayBuffer();
          const { error: upErr } = await supabaseAdmin.storage
            .from("productivity-screenshots")
            .upload(storagePath, buffer, {
              contentType: screenshotField.type,
              upsert: false,
            });
          if (upErr) {
            return Response.json({ error: upErr.message }, { status: 500, headers: corsHeaders() });
          }
          screenshotPath = storagePath;
        }

        // Step 7 — Calculate activity_percentage
        const elapsedMs = endDate.getTime() - startDate.getTime();
        const intervalMinutes = elapsedMs / 60000;
        const weighted = (keystrokes_count as number) * 1 + (mouse_clicks_count as number) * 2;
        const expected = 30 * intervalMinutes;
        const activity_percentage =
          expected > 0 ? Math.min(100, Math.round((weighted / expected) * 10000) / 100) : 0;

        // Step 8 — Insert activity log
        const { error: insErr } = await supabaseAdmin.from("activity_logs").insert({
          session_id,
          user_id: userId,
          keystrokes_count,
          mouse_clicks_count,
          active_window_title: typeof active_window_title === "string" ? active_window_title : null,
          active_application_name:
            typeof active_application_name === "string" ? active_application_name : null,
          interval_start: startDate.toISOString(),
          interval_end: endDate.toISOString(),
          activity_percentage,
          screenshot_path: screenshotPath,
        });
        if (insErr) {
          if (screenshotPath) {
            await supabaseAdmin.storage.from("productivity-screenshots").remove([screenshotPath]);
          }
          return Response.json({ error: insErr.message }, { status: 500, headers: corsHeaders() });
        }

        // Step 9 — Return success
        return Response.json({ ok: true }, { headers: corsHeaders() });
      },
    },
  },
});
