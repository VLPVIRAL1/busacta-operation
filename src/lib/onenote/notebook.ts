import { graphFetch, invalidateTokenCache } from "@/lib/sharepoint/graph-client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format, parseISO } from "date-fns";

// ── Site ID resolution ────────────────────────────────────────────────────────
// Converts a SharePoint site URL into a Graph site ID.
// Uses the /sites/{hostname}:{path} lookup — same approach as the SharePoint
// Document Hub integration. Result is NOT cached across isolates; each Worker
// request resolves once and reuses within that request via call sequencing.

export async function getSiteId(siteUrl: string): Promise<string> {
  const url = new URL(siteUrl);
  const hostname = url.hostname; // e.g. offshoretax.sharepoint.com

  // Normalize: admins sometimes paste a full document-library or list URL
  // (e.g. /sites/Test/One%20Notes/Forms/AllItems.aspx) instead of just the site
  // root. SharePoint site paths are always the first two segments (/sites/Name or
  // /teams/Name), so strip anything beyond that.
  const segments = url.pathname.split("/").filter(Boolean);
  const sitePath = segments.length > 2 ? "/" + segments.slice(0, 2).join("/") : url.pathname;

  const res = await graphFetch<{ id: string }>({
    path: `/sites/${hostname}:${sitePath}`,
  });
  if (!res.id)
    throw new Error(
      `Could not resolve SharePoint site ID for ${siteUrl}. ` +
        `Make sure the OneNote Site URL in Admin → Integrations → Microsoft Graph ` +
        `points to the site root, e.g. https://${hostname}${sitePath}`,
    );
  return res.id;
}

// ── OneNote base path (site-scoped) ──────────────────────────────────────────
// All OneNote operations use /sites/{site-id}/onenote/... with app-only auth.
// This requires Notes.ReadWrite.All + Sites.FullControl.All Application permissions
// (both already granted in Azure Portal — no UPN needed).

const onenotePath = (siteId: string) => `/sites/${encodeURIComponent(siteId)}/onenote`;

const AZURE_PERMISSION_HINT =
  "Go to Azure Portal → App Registrations → [BusAcTa app] → API Permissions → " +
  "ensure Notes.ReadWrite.All and Sites.FullControl.All are Application permissions with admin consent.";

async function wrapOneNoteAuth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("[401]") || msg.includes("40001")) {
      // The cached token may have been issued before permissions were consented.
      // Clear it and retry in the same request — handles CF Workers per-isolate caching.
      invalidateTokenCache();
      try {
        return await fn();
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (retryMsg.includes("[401]") || retryMsg.includes("40001")) {
          throw new Error(`OneNote API returned 401 — ${AZURE_PERMISSION_HINT}`);
        }
        throw retryErr;
      }
    }
    throw err;
  }
}

type NotebookItem = {
  id: string;
  displayName: string;
  self?: string;
  links?: {
    oneNoteWebUrl?: { href?: string };
    oneNoteClientUrl?: { href?: string };
  };
};
type SectionItem = { id: string; displayName: string };

export async function getOrCreateNotebook(
  siteId: string,
  employeeId: string,
  employeeName: string,
  supabaseAdmin: SupabaseClient,
): Promise<string> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("onenote_notebook_id")
    .eq("id", employeeId)
    .maybeSingle();

  const cached = (profile as { onenote_notebook_id?: string | null } | null)?.onenote_notebook_id;
  if (cached) return cached;

  const notebookName = `${employeeName} — Daily Notes`;

  const listRes = await wrapOneNoteAuth(() =>
    graphFetch<{ value: NotebookItem[] }>({
      path: `${onenotePath(siteId)}/notebooks?$select=id,displayName,links`,
    }),
  );

  const existing = listRes.value.find((n) => n.displayName === notebookName);
  let notebookId: string;
  let webUrl: string | undefined;

  if (existing) {
    notebookId = existing.id;
    webUrl = existing.links?.oneNoteWebUrl?.href;
  } else {
    const created = await wrapOneNoteAuth(() =>
      graphFetch<NotebookItem>({
        method: "POST",
        path: `${onenotePath(siteId)}/notebooks`,
        body: { displayName: notebookName },
      }),
    );
    notebookId = created.id;
    webUrl = created.links?.oneNoteWebUrl?.href;
  }

  await supabaseAdmin
    .from("profiles")
    .update({
      onenote_notebook_id: notebookId,
      onenote_notebook_url: webUrl ?? null,
    } as never)
    .eq("id", employeeId);

  return notebookId;
}

export async function getOrCreateSection(
  siteId: string,
  notebookId: string,
  noteDate: string,
): Promise<string> {
  const sectionName = format(parseISO(noteDate), "MMMM yyyy");

  const listRes = await wrapOneNoteAuth(() =>
    graphFetch<{ value: SectionItem[] }>({
      path: `${onenotePath(siteId)}/notebooks/${notebookId}/sections?$select=id,displayName`,
    }),
  );

  // Pick first match; duplicates from manual edits are fine
  const existing = listRes.value.find(
    (s) => s.displayName.toLowerCase() === sectionName.toLowerCase(),
  );
  if (existing) return existing.id;

  const created = await wrapOneNoteAuth(() =>
    graphFetch<SectionItem>({
      method: "POST",
      path: `${onenotePath(siteId)}/notebooks/${notebookId}/sections`,
      body: { displayName: sectionName },
    }),
  );
  return created.id;
}

export async function resolveNotebookUrl(
  siteId: string,
  notebookUrl: string,
): Promise<{ notebookId: string; webUrl: string }> {
  const listRes = await wrapOneNoteAuth(() =>
    graphFetch<{ value: NotebookItem[] }>({
      path: `${onenotePath(siteId)}/notebooks?$select=id,displayName,links,self`,
    }),
  );

  // ── Parse identity clues from the user-supplied URL ─────────────────────────
  // Clue 1: sourcedoc GUID (all SharePoint OneNote URL variants)
  const rawSourcedoc = notebookUrl.match(/[?&]sourcedoc=([^&]+)/i)?.[1];
  const inputGuid = rawSourcedoc
    ? decodeURIComponent(rawSourcedoc).replace(/[{}]/g, "").toLowerCase()
    : null;

  // Clue 2: file= param → notebook display name
  const rawFile = notebookUrl.match(/[?&]file=([^&]+)/i)?.[1];
  const inputFileName = rawFile ? decodeURIComponent(rawFile).toLowerCase() : null;

  // Clue 3: RootFolder= param → server-relative path
  const rawRootFolder = notebookUrl.match(/[?&]RootFolder=([^&]+)/i)?.[1];
  const inputRootFolder = rawRootFolder ? decodeURIComponent(rawRootFolder).toLowerCase() : null;

  const inputLower = notebookUrl.toLowerCase();

  const match = listRes.value.find((n) => {
    const webHref = (n.links?.oneNoteWebUrl?.href ?? "").toLowerCase();
    const clientHref = (n.links?.oneNoteClientUrl?.href ?? "").toLowerCase();
    const selfHref = (n.self ?? "").toLowerCase();

    // (a) Exact URL match only — substring/includes deliberately avoided to prevent
    //     attacker from resolving wrong notebook via a short shared-prefix URL.
    if (webHref && webHref === inputLower) {
      return true;
    }
    // (b) sourcedoc GUID match — most reliable for SharePoint Doc.aspx URLs
    if (inputGuid) {
      const hrefGuidRaw = webHref.match(/sourcedoc=([^&]+)/i)?.[1];
      const hrefGuid = hrefGuidRaw
        ? decodeURIComponent(hrefGuidRaw).replace(/[{}]/g, "").toLowerCase()
        : null;
      if (hrefGuid === inputGuid) return true;
      if (clientHref.includes(inputGuid) || selfHref.includes(inputGuid)) return true;
    }
    // (c) RootFolder path match
    if (inputRootFolder) {
      if (
        webHref.includes(inputRootFolder) ||
        clientHref.includes(inputRootFolder) ||
        selfHref.includes(inputRootFolder)
      ) {
        return true;
      }
    }
    // (d) Display name fallback
    if (inputFileName && n.displayName.toLowerCase() === inputFileName) return true;

    return false;
  });

  if (!match) {
    const tried: string[] = [];
    if (inputGuid) tried.push(`GUID ${inputGuid}`);
    if (inputFileName) tried.push(`name "${inputFileName}"`);
    if (inputRootFolder) tried.push(`path "${inputRootFolder}"`);
    const detail = tried.length ? ` (tried matching by ${tried.join(", ")})` : "";
    throw new Error(
      `Notebook not found in the configured SharePoint site${detail}. ` +
        `Verify the site URL in Admin → Integrations and that the notebook exists there.`,
    );
  }

  return {
    notebookId: match.id,
    webUrl: match.links?.oneNoteWebUrl?.href ?? notebookUrl,
  };
}
