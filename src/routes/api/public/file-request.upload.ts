// Public multipart upload endpoint for "Request File" links.
// Validates the token, uploads to storage with the service role client, and
// records the attachment in the task's "Unsorted Documents" folder.
import { createFileRoute } from "@tanstack/react-router";

const UNSORTED_FOLDER = "Unsorted Documents";
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file
const TOKEN_RE = /^[a-zA-Z0-9_-]{20,128}$/;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const Route = createFileRoute("/api/public/file-request/upload")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json(
            { error: "Invalid form data" },
            { status: 400, headers: corsHeaders() },
          );
        }
        const token = String(form.get("token") ?? "");
        const file = form.get("file");
        if (!TOKEN_RE.test(token)) {
          return Response.json({ error: "Invalid token" }, { status: 400, headers: corsHeaders() });
        }
        if (!(file instanceof File)) {
          return Response.json({ error: "Missing file" }, { status: 400, headers: corsHeaders() });
        }
        if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
          return Response.json(
            { error: "File too large or empty" },
            { status: 400, headers: corsHeaders() },
          );
        }

        const { data: link, error: linkErr } = await supabaseAdmin
          .from("file_request_links")
          .select("id, task_id, expires_at, max_uploads, upload_count, revoked_at, password_hash")
          .eq("token", token)
          .maybeSingle();
        if (linkErr)
          return Response.json({ error: linkErr.message }, { status: 500, headers: corsHeaders() });
        if (!link)
          return Response.json(
            { error: "Link not found" },
            { status: 404, headers: corsHeaders() },
          );
        if (link.revoked_at)
          return Response.json({ error: "Link revoked" }, { status: 410, headers: corsHeaders() });
        if (new Date(link.expires_at).getTime() < Date.now())
          return Response.json({ error: "Link expired" }, { status: 410, headers: corsHeaders() });
        if ((link.upload_count ?? 0) >= link.max_uploads)
          return Response.json(
            { error: "Upload limit reached" },
            { status: 410, headers: corsHeaders() },
          );

        // Password gate (system-generated; required for every new link).
        if ((link as { password_hash?: string | null }).password_hash) {
          const provided = String(form.get("password") ?? "");
          const { verifyFileRequestPassword } = await import("@/lib/ops/file-request-password");
          const ok = await verifyFileRequestPassword(
            provided,
            (link as { password_hash: string }).password_hash,
          );
          if (!ok)
            return Response.json(
              { error: "Invalid password" },
              { status: 401, headers: corsHeaders() },
            );
        }

        // Ensure Unsorted Documents folder exists (the trigger seeds it, but be defensive).
        await supabaseAdmin
          .from("task_document_folders")
          .upsert(
            {
              task_id: link.task_id,
              path: UNSORTED_FOLDER,
              is_system: true,
              is_client_visible: false,
            },
            { onConflict: "task_id,path" },
          );

        const cleanName = file.name.replace(/[\/\\\n\r]/g, "_").slice(0, 200) || "upload";
        const uuid = crypto.randomUUID();
        const storagePath = `${link.task_id}/${UNSORTED_FOLDER}/${uuid}-${cleanName}`;

        const buffer = await file.arrayBuffer();
        const { error: upErr } = await supabaseAdmin.storage
          .from("task-attachments")
          .upload(storagePath, buffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr)
          return Response.json({ error: upErr.message }, { status: 500, headers: corsHeaders() });

        const { error: insErr } = await supabaseAdmin.from("task_attachments").insert({
          task_id: link.task_id,
          folder_path: UNSORTED_FOLDER,
          storage_path: storagePath,
          filename: cleanName,
          size_bytes: file.size,
          mime_type: file.type || null,
          uploader_id: null,
          source: "file_request",
        });
        if (insErr) {
          await supabaseAdmin.storage.from("task-attachments").remove([storagePath]);
          return Response.json({ error: insErr.message }, { status: 500, headers: corsHeaders() });
        }

        await supabaseAdmin
          .from("file_request_links")
          .update({
            upload_count: (link.upload_count ?? 0) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", link.id);

        return Response.json({ ok: true, filename: cleanName }, { headers: corsHeaders() });
      },
    },
  },
});
