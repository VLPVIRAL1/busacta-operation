import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken } from "./auth";
import { getOrCreateNotebook, getOrCreateSection, getSiteId } from "./notebook";
import { tiptapJsonToOneNoteHtml, tiptapJsonToOneNoteBodyHtml } from "./converter";
import { loadMicrosoftGraphConfig, isFeatureEnabled } from "@/lib/sharepoint/credentials.server";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

type NoteRow = {
  id: string;
  owner_id: string;
  title: string | null;
  note_date: string;
  content_json: unknown;
  onenote_page_id: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  onenote_notebook_id: string | null;
};

async function graphRequest<T = unknown>(
  accessToken: string,
  method: string,
  path: string,
  body?: BodyInit,
  contentType?: string,
): Promise<T | null> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const msg =
      typeof parsed === "object" && parsed !== null && "error" in parsed
        ? JSON.stringify((parsed as { error: unknown }).error)
        : String(parsed);
    const err = new Error(`Graph ${method} ${path} [${res.status}]: ${msg}`);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return parsed as T;
}

export async function syncNoteToOneNote(
  supabaseAdmin: SupabaseClient,
  userId: string,
  noteId: string,
): Promise<void> {
  // 0. Check firm-level OneNote config — skip silently if not set up or disabled
  const cfg = await loadMicrosoftGraphConfig();
  if (!cfg) return; // integration disabled or not configured
  if (!isFeatureEnabled(cfg.onenote_enabled)) return; // OneNote sync turned off in admin
  const siteUrl = cfg.onenote_site_url?.trim();
  if (!siteUrl) return; // OneNote not configured for this firm

  // 1. Fetch note — security: verify ownership
  const { data: noteData, error: noteErr } = await supabaseAdmin
    .from("daily_notes")
    .select("id, owner_id, title, note_date, content_json, onenote_page_id")
    .eq("id", noteId)
    .maybeSingle();
  if (noteErr) throw noteErr;
  if (!noteData) throw new Error(`Note ${noteId} not found`);
  const note = noteData as unknown as NoteRow;
  if (note.owner_id !== userId) throw new Error("Forbidden: note belongs to another user");

  // 2. Fetch profile — name + cached notebook id
  const { data: profileData } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, onenote_notebook_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profileData) return;
  const profile = profileData as unknown as ProfileRow;

  // 3. Resolve SharePoint site ID + get app-only token
  const siteId = await getSiteId(siteUrl);
  const accessToken = await getAccessToken();

  // 4. Ensure notebook (stored in the configured SharePoint site) and section
  const employeeName = profile.full_name ?? "Employee";
  const notebookId = await getOrCreateNotebook(siteId, userId, employeeName, supabaseAdmin);
  const sectionId = await getOrCreateSection(siteId, notebookId, note.note_date);

  // 5. Convert content
  const busActaBaseUrl = process.env.BUSACTA_BASE_URL ?? "https://busacta.com";
  const title = note.title ?? "Untitled note";
  const fullHtml = tiptapJsonToOneNoteHtml(
    note.content_json,
    title,
    note.note_date,
    busActaBaseUrl,
    noteId,
  );
  const bodyHtml = tiptapJsonToOneNoteBodyHtml(
    note.content_json,
    title,
    note.note_date,
    busActaBaseUrl,
    noteId,
  );

  const siteIdEncoded = encodeURIComponent(siteId);

  // 6a. Create page (first sync)
  if (!note.onenote_page_id) {
    const htmlBytes = new TextEncoder().encode(fullHtml);
    const created = await graphRequest<{ id: string }>(
      accessToken,
      "POST",
      `/sites/${siteIdEncoded}/onenote/sections/${sectionId}/pages`,
      htmlBytes,
      "text/html",
    );
    if (created?.id) {
      // Clear any previous sync error recorded in the DB
      await supabaseAdmin
        .from("daily_notes")
        .update({ onenote_page_id: created.id, onenote_sync_error: null } as never)
        .eq("id", noteId);
    }
    return;
  }

  // 6b. Patch existing page
  try {
    await graphRequest(
      accessToken,
      "PATCH",
      `/sites/${siteIdEncoded}/onenote/pages/${note.onenote_page_id}/content`,
      JSON.stringify([{ target: "body", action: "replace", content: bodyHtml }]),
      "application/json",
    );
    // PATCH succeeded — clear any previous sync error
    await supabaseAdmin
      .from("daily_notes")
      .update({ onenote_sync_error: null } as never)
      .eq("id", noteId);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 404) {
      // Page deleted externally — clear the ID and re-create
      await supabaseAdmin
        .from("daily_notes")
        .update({ onenote_page_id: null } as never)
        .eq("id", noteId);

      const htmlBytes = new TextEncoder().encode(fullHtml);
      const recreated = await graphRequest<{ id: string }>(
        accessToken,
        "POST",
        `/sites/${siteIdEncoded}/onenote/sections/${sectionId}/pages`,
        htmlBytes,
        "text/html",
      );
      if (recreated?.id) {
        // Clear any previous sync error now that we've successfully re-created the page
        await supabaseAdmin
          .from("daily_notes")
          .update({ onenote_page_id: recreated.id, onenote_sync_error: null } as never)
          .eq("id", noteId);
      }
      return;
    }
    throw err;
  }
}
