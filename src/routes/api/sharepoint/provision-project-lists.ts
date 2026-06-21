// POST /api/sharepoint/provision-project-lists
// Enqueues a provision_project_lists job for a project.
// Auth: firm admin only — caller must have admin or super_admin role for the project's firm.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/sharepoint/provision-project-lists")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // ── Auth ──────────────────────────────────────────────────────────────
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.replace("Bearer ", "");

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server not configured", { status: 503 });
        }

        const authClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims } = await authClient.auth.getClaims(token);
        if (!claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub as string;

        // ── Parse body ────────────────────────────────────────────────────────
        let body: { project_id?: string };
        try {
          body = (await request.json()) as { project_id?: string };
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const { project_id } = body;
        if (!project_id) {
          return Response.json({ error: "project_id is required" }, { status: 400 });
        }

        // ── Authorise: caller must be admin/super_admin for this project's firm ──
        const { data: projRaw } = await supabaseAdmin
          .from("projects")
          .select("firm_id")
          .eq("id", project_id)
          .maybeSingle();
        const firmId = (projRaw as { firm_id: string | null } | null)?.firm_id;
        if (!firmId) {
          return Response.json({ error: "Project not found" }, { status: 404 });
        }

        const { data: roleRaw } = await supabaseAdmin
          .from("user_roles" as never)
          .select("role")
          .eq("user_id", userId)
          .eq("firm_id", firmId)
          .maybeSingle();
        const role = (roleRaw as { role: string } | null)?.role;
        if (role !== "admin" && role !== "super_admin") {
          return new Response("Forbidden", { status: 403 });
        }

        // ── Enqueue ───────────────────────────────────────────────────────────
        const { error } = await supabaseAdmin.from("sharepoint_sync_jobs" as never).insert({
          firm_id: firmId,
          job_type: "provision_project_lists",
          payload: { project_id },
          status: "queued",
          attempts: 0,
          max_attempts: 5,
          next_run_at: new Date().toISOString(),
        } as never);

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({ queued: true });
      },
    },
  },
});
