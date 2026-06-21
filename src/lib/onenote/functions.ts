import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  graphFetch,
  getAccessToken,
  invalidateTokenCache,
} from "@/lib/sharepoint/graph-client.server";
import { loadMicrosoftGraphConfig, isFeatureEnabled } from "@/lib/sharepoint/credentials.server";
import { syncNoteToOneNote } from "./sync";
import { resolveNotebookUrl, getSiteId } from "./notebook";

export type OneNoteSyncResult =
  | { ok: true }
  | { ok: false; reason: "no_config" | "error"; message?: string };

export type OneNoteStatusResult = { status: "not_configured" | "ready" };

// ─── Sync a note to OneNote ──────────────────────────────────────────────────

export const syncNoteToOneNoteServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ noteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OneNoteSyncResult> => {
    try {
      await syncNoteToOneNote(supabaseAdmin, context.userId, data.noteId);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[OneNote sync]", message);

      // Record the failure in the DB (skip auth/config errors — not retryable per-note)
      if (!message.includes("Forbidden") && !message.includes("not configured")) {
        await supabaseAdmin
          .from("daily_notes")
          .update({ onenote_sync_error: message } as never)
          .eq("id", data.noteId);
      }

      if (message.includes("not configured") || message.includes("onenote_site_url")) {
        return { ok: false, reason: "no_config" };
      }
      return { ok: false, reason: "error", message };
    }
  });

// ─── Get OneNote status (firm-level config check) ────────────────────────────

export const getOneNoteStatusServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<OneNoteStatusResult> => {
    const cfg = await loadMicrosoftGraphConfig();
    if (!cfg || !isFeatureEnabled(cfg.onenote_enabled)) {
      return { status: "not_configured" };
    }
    const siteUrl = cfg.onenote_site_url?.trim();
    return { status: siteUrl ? "ready" : "not_configured" };
  });

// ─── HR: resolve + save an existing notebook URL ────────────────────────────

const resolveNotebookSchema = z.object({
  employeeId: z.string().uuid(),
  notebookUrl: z.string().min(1),
});

export const resolveAndSaveNotebookServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resolveNotebookSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertHrOrAdmin(context.userId);

    const cfg = await loadMicrosoftGraphConfig();
    const siteUrl = cfg?.onenote_site_url?.trim();
    if (!siteUrl) {
      throw new Error(
        "OneNote SharePoint Site is not configured. Go to Admin → Integrations → Microsoft Graph and set it.",
      );
    }

    const siteId = await getSiteId(siteUrl);
    const { notebookId, webUrl } = await resolveNotebookUrl(siteId, data.notebookUrl);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ onenote_notebook_id: notebookId, onenote_notebook_url: webUrl } as never)
      .eq("id", data.employeeId);
    if (error) throw new Error(error.message);

    return { ok: true, notebookId, webUrl };
  });

// ─── HR: clear notebook config (reset to auto-create) ───────────────────────

export const clearOneNoteNotebookServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ employeeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertHrOrAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ onenote_notebook_id: null, onenote_notebook_url: null } as never)
      .eq("id", data.employeeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── HR: test OneNote API access ─────────────────────────────────────────────

export type OneNoteTestResult =
  | { ok: true; notebookCount: number; notebooks: string[]; siteUrl: string }
  | { ok: false; stage: "config" | "token" | "site" | "api"; error: string; siteUrl?: string };

export const testOneNoteAccessServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OneNoteTestResult> => {
    await assertHrOrAdmin(context.userId);

    const cfg = await loadMicrosoftGraphConfig();
    const siteUrl = cfg?.onenote_site_url?.trim();
    if (!siteUrl) {
      return {
        ok: false,
        stage: "config",
        error:
          "OneNote SharePoint Site is not set. Go to Admin → Integrations → Microsoft Graph and add it.",
      };
    }

    // Force a fresh token
    invalidateTokenCache();

    let token: string;
    try {
      token = await getAccessToken();
    } catch (err) {
      return {
        ok: false,
        stage: "token",
        siteUrl,
        error: `Could not obtain an app-only token: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Decode JWT to inspect actual roles in the token
    let tokenAppId = "(unknown)";
    let tokenRoles: string[] = [];
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as Record<
          string,
          unknown
        >;
        tokenAppId = (payload.appid as string) ?? (payload.azp as string) ?? "(unknown)";
        tokenRoles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
      }
    } catch {
      // non-critical
    }

    const hasNotesRole = tokenRoles.some((r) => r.toLowerCase() === "notes.readwrite.all");
    if (!hasNotesRole) {
      return {
        ok: false,
        stage: "token",
        siteUrl,
        error:
          `Token (app: ${tokenAppId}) does NOT contain Notes.ReadWrite.All. ` +
          `Roles present: [${tokenRoles.join(", ") || "none"}]. ` +
          `In Azure Portal → App Registrations → app "${tokenAppId}" → API Permissions, ` +
          `add Notes.ReadWrite.All as an Application permission and grant admin consent.`,
      };
    }

    // Resolve the SharePoint site ID
    let siteId: string;
    try {
      siteId = await getSiteId(siteUrl);
    } catch (err) {
      return {
        ok: false,
        stage: "site",
        siteUrl,
        error: `Could not resolve SharePoint site: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // List notebooks in the site
    try {
      const res = await graphFetch<{ value: Array<{ displayName: string }> }>({
        path: `/sites/${encodeURIComponent(siteId)}/onenote/notebooks?$select=displayName&$top=10`,
        headers: { Authorization: `Bearer ${token}` },
      });
      const names = (res.value ?? []).map((n) => n.displayName);
      return { ok: true, siteUrl, notebookCount: names.length, notebooks: names };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        stage: "api",
        siteUrl,
        error: `API call failed (token app: ${tokenAppId}). ${msg}`,
      };
    }
  });

// ─── HR: bulk backfill — sync all un-synced notes for an employee ────────────

export type OneNoteBulkSyncResult = {
  /** Total un-synced notes found at the start of this run */
  total: number;
  /** Notes successfully pushed to OneNote in this batch */
  synced: number;
  /** Notes still un-synced after this batch (> 0 when total > BULK_SYNC_LIMIT) */
  remaining: number;
  errors: Array<{ noteDate: string; message: string }>;
};

/** Maximum notes pushed per call — keeps CF Worker well within the 30-second limit */
const BULK_SYNC_LIMIT = 50;

export const syncAllNotesForEmployeeServerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ employeeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OneNoteBulkSyncResult> => {
    await assertHrOrAdmin(context.userId);

    // Quick config guard
    const cfg = await loadMicrosoftGraphConfig();
    if (!cfg?.onenote_site_url?.trim()) {
      throw new Error(
        "OneNote SharePoint Site is not configured. Go to Admin → Integrations → Microsoft Graph.",
      );
    }

    // Count ALL notes that need syncing:
    //   - never synced (onenote_page_id IS NULL), OR
    //   - previously failed (onenote_sync_error IS NOT NULL — includes failed patches)
    const { count } = await supabaseAdmin
      .from("daily_notes")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", data.employeeId)
      .or("onenote_page_id.is.null,onenote_sync_error.not.is.null");

    const total = count ?? 0;
    if (total === 0) return { total: 0, synced: 0, remaining: 0, errors: [] };

    // Fetch this batch — oldest-first so pages are created in chronological order
    const { data: notes, error } = await supabaseAdmin
      .from("daily_notes")
      .select("id, note_date")
      .eq("owner_id", data.employeeId)
      .or("onenote_page_id.is.null,onenote_sync_error.not.is.null")
      .order("note_date", { ascending: true })
      .limit(BULK_SYNC_LIMIT);

    if (error) throw new Error(error.message);
    if (!notes || notes.length === 0) return { total, synced: 0, remaining: 0, errors: [] };

    const errors: Array<{ noteDate: string; message: string }> = [];
    let synced = 0;

    for (const note of notes as Array<{ id: string; note_date: string }>) {
      try {
        // Pass employeeId as userId — ownership check in syncNoteToOneNote passes
        // because we are the HR actor authorised above, syncing on their behalf.
        // sync.ts clears onenote_sync_error on success.
        await syncNoteToOneNote(supabaseAdmin, data.employeeId, note.id);
        synced++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ noteDate: note.note_date, message });
        // Persist the error so this note remains in the retry queue
        await supabaseAdmin
          .from("daily_notes")
          .update({ onenote_sync_error: message } as never)
          .eq("id", note.id);
      }
    }

    // Remaining = notes not yet fetched in this batch
    const remaining = Math.max(0, total - notes.length);
    return { total, synced, remaining, errors };
  });

// ─── Helper ─────────────────────────────────────────────────────────────────

async function assertHrOrAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin", "hr_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: HR Manager or Admin role required");
}
