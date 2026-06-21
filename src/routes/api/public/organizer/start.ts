import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getActivePublicLinkServer, verifyPassword } from "@/lib/organizer/public-links.server";

const Body = z.object({
  token: z.string().min(8).max(64),
  password: z.string().max(128).optional(),
  identity: z
    .object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().max(255),
      company: z.string().trim().max(200).optional(),
    })
    .optional(),
});

export const Route = createFileRoute("/api/public/organizer/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const link = await getActivePublicLinkServer(body.token);
        if (!link) {
          return new Response(JSON.stringify({ error: "Link is invalid, expired, or revoked" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (link.password_hash) {
          if (!body.password || !verifyPassword(body.password, link.password_hash)) {
            return new Response(JSON.stringify({ error: "Password required or incorrect" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        if (link.require_identity && !body.identity) {
          return new Response(JSON.stringify({ error: "Identity required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Snapshot template version
        const { data: tpl, error: tplErr } = await supabaseAdmin
          .from("organizer_templates")
          .select("version, status")
          .eq("id", link.template_id)
          .single();
        if (tplErr || !tpl) {
          return new Response(JSON.stringify({ error: tplErr?.message ?? "Template missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (tpl.status !== "published") {
          return new Response(JSON.stringify({ error: "Template is no longer published" }), {
            status: 410,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sessionToken = randomUUID();
        const placeholderTargetId = link.firm_id ?? "00000000-0000-0000-0000-000000000000";

        const { data: dep, error: depErr } = await supabaseAdmin
          .from("organizer_deployments")
          .insert({
            template_id: link.template_id,
            template_version: tpl.version,
            target_type: "client_entity",
            target_id: placeholderTargetId,
            assignee_profile_id: null,
            assigned_by: null,
            firm_id: link.firm_id,
            public_link_id: link.id,
            external_name: body.identity?.name ?? null,
            external_email: body.identity?.email ?? null,
            external_company: body.identity?.company ?? null,
            anon_session_token: sessionToken,
            status: "not_started",
          } as never)
          .select("id")
          .single();
        if (depErr || !dep) {
          return new Response(JSON.stringify({ error: depErr?.message ?? "Could not start" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return Response.json({
          deployment_id: dep.id,
          session_token: sessionToken,
        });
      },
    },
  },
});
