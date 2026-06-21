// SharePoint document upload endpoint.
// Accepts multipart/form-data: { taskId, projectId, file }.
// Uploads the file to the task's SharePoint folder and records metadata in `documents`.
// Auth: requires a valid Supabase JWT in the Authorization header.
import { createFileRoute } from "@tanstack/react-router";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB hard limit — matches upload.ts

export const Route = createFileRoute("/api/sharepoint/upload-document")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // ── 1. Authenticate the caller ────────────────────────────────────
        const authHeader = request.headers.get("authorization") ?? "";
        const jwt = authHeader.replace(/^bearer\s+/i, "").trim();
        if (!jwt) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Verify JWT via Supabase (uses the same secret)
        const { createClient } = await import("@supabase/supabase-js");
        const userClient = createClient(
          process.env.SUPABASE_URL ?? "",
          process.env.SUPABASE_ANON_KEY ?? "",
          { global: { headers: { Authorization: `Bearer ${jwt}` } } },
        );
        const {
          data: { user },
          error: authErr,
        } = await userClient.auth.getUser();
        if (authErr || !user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // ── 2. Parse FormData ─────────────────────────────────────────────
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Invalid form data" }, { status: 400 });
        }

        const taskId = String(form.get("taskId") ?? "").trim();
        const projectId = String(form.get("projectId") ?? "").trim();
        const file = form.get("file");

        if (!taskId || !projectId) {
          return Response.json({ error: "taskId and projectId are required" }, { status: 400 });
        }
        if (!(file instanceof File)) {
          return Response.json({ error: "Missing file" }, { status: 400 });
        }
        if (file.size <= 0) {
          return Response.json({ error: "File is empty" }, { status: 400 });
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          return Response.json(
            { error: `File exceeds the 200 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)` },
            { status: 413 },
          );
        }

        // ── 3. Load project SharePoint config ─────────────────────────────
        const { data: projRaw } = await supabaseAdmin
          .from("projects")
          .select("sharepoint_drive_id, sharepoint_site_id, sharepoint_list_id, firm_id")
          .eq("id", projectId)
          .maybeSingle();
        const proj = projRaw as {
          sharepoint_drive_id: string | null;
          sharepoint_site_id: string | null;
          sharepoint_list_id: string | null;
          firm_id: string | null;
        } | null;

        if (!proj?.sharepoint_drive_id) {
          return Response.json(
            { error: "SharePoint library not configured for this project" },
            { status: 400 },
          );
        }

        // ── 4. Ensure task folder exists (create if needed) ───────────────
        const { data: taskRaw } = await supabaseAdmin
          .from("tasks")
          .select("id, title, slug, task_type_id, sharepoint_folder_id, entity_id")
          .eq("id", taskId)
          .maybeSingle();
        const task = taskRaw as {
          id: string;
          title: string | null;
          slug: string | null;
          task_type_id: string | null;
          sharepoint_folder_id: string | null;
          entity_id: string | null;
        } | null;

        if (!task) {
          return Response.json({ error: "Task not found" }, { status: 404 });
        }

        let folderId = task.sharepoint_folder_id;
        if (!folderId) {
          // Create the task folder inline — same logic as the job handler
          const { dispatchJob } = await import("@/lib/sharepoint/handlers.server");
          await dispatchJob({
            id: `upload-mkdir-${taskId}`,
            job_type: "create_task_folder",
            payload: { task_id: taskId },
            firm_id: task.entity_id,
          });
          // Reload the folder ID that was just written
          const { data: refreshed } = await supabaseAdmin
            .from("tasks")
            .select("sharepoint_folder_id")
            .eq("id", taskId)
            .maybeSingle();
          folderId =
            (refreshed as { sharepoint_folder_id: string | null } | null)?.sharepoint_folder_id ??
            null;
        }

        if (!folderId) {
          return Response.json(
            { error: "Could not create SharePoint task folder — check project library config" },
            { status: 500 },
          );
        }

        // ── 5. Upload to SharePoint ───────────────────────────────────────
        const { uploadFile } = await import("@/lib/sharepoint/upload");
        const fileName = file.name.replace(/[/\\\n\r]/g, "_").slice(0, 200) || "upload";
        const fileBytes = await file.arrayBuffer();

        let spFile: Awaited<ReturnType<typeof uploadFile>>;
        try {
          spFile = await uploadFile(
            proj.sharepoint_drive_id,
            folderId,
            fileName,
            fileBytes,
            file.type || "application/octet-stream",
          );
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "SharePoint upload failed" },
            { status: 500 },
          );
        }

        // ── 5b. Stamp BusAcTa_Task_ID on the uploaded list item (best-effort) ──
        // This allows delta sync to match the file back to its task without
        // relying solely on folder-name parsing.
        if (proj.sharepoint_site_id && proj.sharepoint_list_id) {
          try {
            const { graphFetch } = await import("@/lib/sharepoint/graph-client.server");
            // Expand the listItem to get its SharePoint list item ID
            const itemWithList = await graphFetch<{
              listItem?: { id: string };
            }>({
              path: `/drives/${encodeURIComponent(proj.sharepoint_drive_id!)}/items/${encodeURIComponent(spFile.id)}?$expand=listItem($select=id)`,
            });
            const listItemId = itemWithList.listItem?.id;
            if (listItemId) {
              await graphFetch({
                method: "PATCH",
                path: `/sites/${encodeURIComponent(proj.sharepoint_site_id)}/lists/${encodeURIComponent(proj.sharepoint_list_id)}/items/${encodeURIComponent(listItemId)}/fields`,
                body: { BusAcTa_Task_ID: taskId },
              });
            }
          } catch {
            // Non-fatal — delta sync will fall back to folder-name matching
          }
        }

        // ── 6. Record in documents table ──────────────────────────────────
        const { data: doc, error: insErr } = await supabaseAdmin
          .from("documents" as never)
          .insert({
            task_id: taskId,
            project_id: projectId,
            firm_id: proj.firm_id,
            file_name: fileName,
            file_size_bytes: file.size,
            mime_type: file.type || null,
            sharepoint_item_id: spFile.id,
            sharepoint_url: spFile.downloadUrl,
            sharepoint_web_url: spFile.webUrl,
            uploaded_by: user.id,
          } as never)
          .select()
          .single();

        if (insErr) {
          // File uploaded but DB record failed — still return partial success
          console.error("[upload-document] DB insert failed:", insErr.message);
          return Response.json(
            { ok: true, warning: "Uploaded but metadata not saved", spFile },
            { status: 207 },
          );
        }

        return Response.json({ ok: true, document: doc });
      },
    },
  },
});
