// Microsoft Graph client foundation.
// - Reads credentials from the DB (integration_credentials.microsoft_graph)
// - Caches the app-only access token in Redis (if REDIS_URL set) or in-memory
// - Provides typed helpers used by the sync worker and API routes
import { loadMicrosoftGraphConfig, type MicrosoftGraphConfig } from "./credentials.server";
import {
  getCachedToken,
  setCachedToken,
  invalidateTokenCache as invalidateCache,
} from "./token-cache.server";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function fetchAppToken(
  cfg: MicrosoftGraphConfig,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant_id)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Microsoft token request failed [${res.status}] ${json.error ?? ""}: ${json.error_description ?? JSON.stringify(json)}`,
    );
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

export async function getAccessToken(): Promise<string> {
  const cached = await getCachedToken();
  if (cached) return cached;

  const cfg = await loadMicrosoftGraphConfig();
  if (!cfg) {
    throw new Error(
      "Microsoft Graph is not configured. Set tenant_id, client_id, client_secret, tenant_domain in Admin → Integrations and enable it.",
    );
  }
  const { accessToken, expiresIn } = await fetchAppToken(cfg);
  await setCachedToken(accessToken, expiresIn);
  return accessToken;
}

/** Force a token refresh (e.g. after admin saves new credentials). */
export function invalidateTokenCache(): void {
  invalidateCache();
}

export type GraphRequestInit = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function graphFetch<T = unknown>(init: GraphRequestInit): Promise<T> {
  const token = await getAccessToken();
  const isJson =
    init.body !== undefined &&
    !(init.body instanceof ArrayBuffer) &&
    !(init.body instanceof Uint8Array);
  const res = await fetch(`${GRAPH_BASE}${init.path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(isJson ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    body:
      init.body === undefined
        ? undefined
        : isJson
          ? JSON.stringify(init.body)
          : (init.body as BodyInit),
  });
  if (res.status === 204) return undefined as T;
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
    throw new Error(`Graph ${init.method ?? "GET"} ${init.path} failed [${res.status}]: ${msg}`);
  }
  return parsed as T;
}

// ─── SharePoint List helpers ────────────────────────────────────────────────

type ListColumnDef =
  | { name: string; kind: "text" }
  | { name: string; kind: "number" }
  | { name: string; kind: "dateTime" }
  | { name: string; kind: "boolean" };

function buildColumnBody(col: ListColumnDef) {
  const indexed = col.name.endsWith("Id");
  switch (col.kind) {
    case "number":
      return { name: col.name, indexed, number: {} };
    case "dateTime":
      return { name: col.name, indexed, dateTime: { displayAs: "default", format: "dateOnly" } };
    case "boolean":
      return { name: col.name, indexed, boolean: {} };
    default:
      return {
        name: col.name,
        indexed,
        text: { allowMultipleLines: col.name === "Body" || col.name === "Payload" },
      };
  }
}

/** Find an existing SharePoint list by display name, or create it with the given columns. Returns the list id. */
export async function getOrCreateSharePointList(
  siteId: string,
  displayName: string,
  columns: ListColumnDef[],
): Promise<string> {
  const lists = await graphFetch<{ value: Array<{ id: string; displayName: string }> }>({
    path: `/sites/${encodeURIComponent(siteId)}/lists?$select=id,displayName`,
  });
  const existing = lists.value.find((l) => l.displayName === displayName);
  if (existing) return existing.id;

  const created = await graphFetch<{ id: string }>({
    method: "POST",
    path: `/sites/${encodeURIComponent(siteId)}/lists`,
    body: { displayName, list: { template: "genericList" } },
  });
  for (const col of columns) {
    await graphFetch({
      method: "POST",
      path: `/sites/${encodeURIComponent(siteId)}/lists/${created.id}/columns`,
      body: buildColumnBody(col),
    }).catch(() => {
      // column may already exist (e.g. idempotent re-run)
    });
  }
  return created.id;
}

/** Append a new item to a SharePoint list. Returns the new item's id. */
export async function addSharePointListItem(
  siteId: string,
  listId: string,
  fields: Record<string, unknown>,
): Promise<string> {
  const result = await graphFetch<{ id: string }>({
    method: "POST",
    path: `/sites/${encodeURIComponent(siteId)}/lists/${listId}/items`,
    body: { fields },
  });
  return result.id;
}

/** Find a list item where fields/{fieldName} eq {value}. Returns the item id or null. */
export async function findSharePointListItem(
  siteId: string,
  listId: string,
  fieldName: string,
  value: string,
): Promise<string | null> {
  const filter = encodeURIComponent(`fields/${fieldName} eq '${value.replace(/'/g, "''")}'`);
  const result = await graphFetch<{ value: Array<{ id: string }> }>({
    path: `/sites/${encodeURIComponent(siteId)}/lists/${listId}/items?$filter=${filter}&$select=id&$top=1`,
  });
  return result.value?.[0]?.id ?? null;
}

/** Create or update a list item matched by a unique field. */
export async function upsertSharePointListItem(
  siteId: string,
  listId: string,
  matchField: string,
  matchValue: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const existingId = await findSharePointListItem(siteId, listId, matchField, matchValue);
  if (existingId) {
    await graphFetch({
      method: "PATCH",
      path: `/sites/${encodeURIComponent(siteId)}/lists/${listId}/items/${existingId}/fields`,
      body: fields,
    });
  } else {
    await addSharePointListItem(siteId, listId, fields);
  }
}

// ─── Credential test ────────────────────────────────────────────────────────

/** Lightweight credential test used by the Admin Integrations page.
 *  Uses GET /sites/root (requires Sites.FullControl.All) instead of
 *  GET /organization (requires Organization.Read.All, not in our permission set). */
export async function testGraphConnection(): Promise<
  { ok: true; tenantDisplayName?: string } | { ok: false; error: string }
> {
  try {
    invalidateTokenCache();
    const result = await graphFetch<{ displayName?: string; webUrl?: string }>({
      method: "GET",
      path: "/sites/root",
    });
    return { ok: true, tenantDisplayName: result.displayName ?? result.webUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
