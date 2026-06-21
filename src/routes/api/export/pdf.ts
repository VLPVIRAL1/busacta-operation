import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getTemplateWithFieldsServer, listTemplatesServer } from "@/lib/pdf-templates/server";
import { renderPdfBuffer } from "@/lib/pdf-templates/renderer";
import { SAMPLE_DATA } from "@/lib/pdf-templates/sample-data";
import type { Database } from "@/integrations/supabase/types";
import type { PdfDocType } from "@/lib/pdf-templates/schemas";

/**
 * GET /api/export/pdf?type=invoice&id=<uuid>&templateId=<optional-uuid>
 *
 * Auth: Bearer token in Authorization header (same as server functions).
 * Returns a streamed PDF response.
 */
export const Route = createFileRoute("/api/export/pdf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
        const { data: authData, error: authErr } = await authClient.auth.getClaims(token);
        if (authErr || !authData?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }

        // ── Params ────────────────────────────────────────────────────────────
        const url = new URL(request.url);
        const docType = (url.searchParams.get("type") ?? "financial_report") as PdfDocType;
        const templateId = url.searchParams.get("templateId");

        // ── Fetch template ────────────────────────────────────────────────────
        let resolvedTemplateId = templateId;
        if (!resolvedTemplateId) {
          // Find the latest published template for this doc type
          const templates = await listTemplatesServer({ docType });
          const published = templates.find((t) => t.status === "published");
          resolvedTemplateId = published?.id ?? templates[0]?.id ?? null;
        }

        if (!resolvedTemplateId) {
          return new Response("No published template found for this document type", {
            status: 404,
          });
        }

        const { template, fields } = await getTemplateWithFieldsServer(resolvedTemplateId);
        if (!template) {
          return new Response("Template not found", { status: 404 });
        }

        // ── Resolve data (sample / preview) ───────────────────────────────────
        const data = (SAMPLE_DATA[docType] ?? {}) as Record<string, unknown>;

        // ── Render PDF ────────────────────────────────────────────────────────
        let buffer: ArrayBuffer;
        try {
          buffer = await renderPdfBuffer(
            template,
            fields,
            data as Parameters<typeof renderPdfBuffer>[2],
          );
        } catch (e) {
          return new Response(`PDF generation failed: ${(e as Error).message}`, { status: 500 });
        }

        // ── Filename ──────────────────────────────────────────────────────────
        const timestamp = new Date().toISOString().slice(0, 10);
        const refNo = (data.invoice_number as string) ?? (data.report_title as string) ?? docType;
        const safe = String(refNo).replace(/[^a-zA-Z0-9-]/g, "-");
        const filename = `${safe}-${timestamp}.pdf`;

        return new Response(buffer, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": String(buffer.byteLength),
          },
        });
      },
    },
  },
});
