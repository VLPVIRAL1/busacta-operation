import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDeploymentByAnonSession } from "@/lib/organizer/public-session.server";

const Body = z.object({
  session_token: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/organizer/context")({
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

        const [tplRes, blocksRes, respRes] = await Promise.all([
          supabaseAdmin.from("organizer_templates").select("*").eq("id", dep.template_id).single(),
          supabaseAdmin
            .from("organizer_blocks")
            .select("*")
            .eq("template_id", dep.template_id)
            .order("order_index", { ascending: true }),
          supabaseAdmin.from("organizer_responses").select("*").eq("deployment_id", dep.id),
        ]);
        if (tplRes.error) return jsonErr(500, tplRes.error.message);
        if (blocksRes.error) return jsonErr(500, blocksRes.error.message);
        if (respRes.error) return jsonErr(500, respRes.error.message);

        return Response.json({
          deployment: dep,
          template: tplRes.data,
          blocks: blocksRes.data ?? [],
          responses: respRes.data ?? [],
        });
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
