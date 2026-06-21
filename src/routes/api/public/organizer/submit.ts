import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDeploymentByAnonSession } from "@/lib/organizer/public-session.server";
import { computeVisibleBlockIds } from "@/lib/organizer/evaluate-rules";
import type { OrganizerBlock } from "@/lib/organizer/schemas";

const Body = z.object({ session_token: z.string().uuid() });

export const Route = createFileRoute("/api/public/organizer/submit")({
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
          return jsonErr(409, `Already ${dep.status}`);
        }

        const [tplRes, blocksRes, respRes] = await Promise.all([
          supabaseAdmin
            .from("organizer_templates")
            .select("is_exam")
            .eq("id", dep.template_id)
            .single(),
          supabaseAdmin.from("organizer_blocks").select("*").eq("template_id", dep.template_id),
          supabaseAdmin
            .from("organizer_responses")
            .select("id, block_id, value_json")
            .eq("deployment_id", dep.id),
        ]);
        if (tplRes.error) return jsonErr(500, tplRes.error.message);
        if (blocksRes.error) return jsonErr(500, blocksRes.error.message);
        if (respRes.error) return jsonErr(500, respRes.error.message);

        const blocks = (blocksRes.data ?? []) as unknown as OrganizerBlock[];
        const responses = respRes.data ?? [];

        const answers = new Map<string, unknown>();
        for (const r of responses) answers.set(r.block_id, r.value_json);
        const visible = computeVisibleBlockIds(blocks, answers);

        const missing: string[] = [];
        for (const b of blocks) {
          if (!b.is_required) continue;
          if (b.block_type === "section" || b.block_type === "info") continue;
          if (!visible.has(b.id)) continue;
          const resp = responses.find((r) => r.block_id === b.id);
          if (!resp || resp.value_json === null) {
            missing.push(b.question_text || b.id);
          }
        }
        if (missing.length > 0) {
          return jsonErr(
            400,
            `${missing.length} required question(s) unanswered: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`,
          );
        }

        const nextStatus = tplRes.data.is_exam ? "under_review" : "submitted";
        const { error: upErr } = await supabaseAdmin
          .from("organizer_deployments")
          .update({
            status: nextStatus,
            submitted_at: new Date().toISOString(),
          } as never)
          .eq("id", dep.id);
        if (upErr) return jsonErr(500, upErr.message);

        if (dep.public_link_id) {
          await supabaseAdmin.rpc(
            "increment_public_link_submission" as never,
            {
              link_id: dep.public_link_id,
            } as never,
          );
        }

        return Response.json({ ok: true, status: nextStatus });
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
