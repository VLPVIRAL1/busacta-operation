import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDeploymentByAnonSession } from "@/lib/organizer/public-session.server";

const Body = z.object({
  session_token: z.string().uuid(),
  block_id: z.string().uuid(),
  value_json: z.unknown().nullable(),
  last_visited_block_id: z.string().uuid().nullable().optional(),
});

export const Route = createFileRoute("/api/public/organizer/save")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch (e) {
          return jsonErr(400, (e as Error).message);
        }

        const dep = await getDeploymentByAnonSession(body.session_token);
        if (!dep) return jsonErr(404, "Session not found");
        if (!["not_started", "in_progress", "returned"].includes(dep.status)) {
          return jsonErr(409, `Deployment is ${dep.status}`);
        }

        const { error } = await supabaseAdmin.from("organizer_responses").upsert(
          {
            deployment_id: dep.id,
            block_id: body.block_id,
            value_json: (body.value_json ?? null) as never,
            answered_by: dep.assignee_profile_id ?? null,
            answered_at: new Date().toISOString(),
            is_skipped: false,
          } as never,
          { onConflict: "deployment_id,block_id" },
        );
        if (error) return jsonErr(500, error.message);

        const patch: Record<string, unknown> = {};
        if (dep.status === "not_started") patch.status = "in_progress";
        if (body.last_visited_block_id !== undefined)
          patch.last_visited_block_id = body.last_visited_block_id;
        if (Object.keys(patch).length > 0) {
          await supabaseAdmin
            .from("organizer_deployments")
            .update(patch as never)
            .eq("id", dep.id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});

function jsonErr(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
