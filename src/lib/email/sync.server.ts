// Email sync engine — SERVER ONLY.
// Microsoft Graph adapter: bootstraps recent messages and runs incremental
// delta. Provider-agnostic boundary lives here so a Gmail adapter can plug
// in later behind the same shape.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  readMicrosoftCredentials,
  refreshAccessToken,
  type MicrosoftCredentials,
} from "./providers/microsoft.server";

type AccountRow = {
  id: string;
  user_id: string;
  provider: string;
  email_address: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  delta_token: string | null;
};

function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Strip <script>, <iframe>, on* handlers, and javascript: URLs. Iframe
 *  sandbox in the reader is the second line of defense. */
export function basicHtmlSanitize(html: string | null | undefined): string {
  if (!html) return "";
  let out = html;
  out = out.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  out = out.replace(/<\s*iframe[\s\S]*?<\s*\/\s*iframe\s*>/gi, "");
  out = out.replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/(href|src|action|formaction)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "$1=$2#$2");
  return out;
}

/** Returns a valid access token for the account, refreshing if expired. */
async function getValidAccessToken(
  client: SupabaseClient,
  account: AccountRow,
  creds: MicrosoftCredentials,
): Promise<string> {
  const exp = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  const skew = 60_000;
  if (account.access_token_encrypted && exp - skew > Date.now()) {
    return account.access_token_encrypted;
  }
  if (!account.refresh_token_encrypted) {
    throw new Error("No refresh token on file. Please reconnect this mailbox.");
  }
  const tokens = await refreshAccessToken(creds, account.refresh_token_encrypted);
  const newExpires = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await client
    .from("connected_email_accounts")
    .update({
      access_token_encrypted: tokens.access_token,
      refresh_token_encrypted: tokens.refresh_token ?? account.refresh_token_encrypted,
      token_expires_at: newExpires,
    })
    .eq("id", account.id);
  return tokens.access_token;
}

type GraphAddress = { name?: string; address?: string };
type GraphRecipient = { emailAddress?: GraphAddress };
type GraphMessage = {
  id: string;
  conversationId: string;
  subject: string | null;
  bodyPreview: string | null;
  body?: { contentType: "html" | "text"; content: string };
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  internetMessageId?: string;
  parentFolderId?: string;
  "@removed"?: { reason: string };
};

const FOLDER_MAP: Record<string, string> = {
  inbox: "inbox",
  sentitems: "sent",
  drafts: "drafts",
  archive: "archive",
  deleteditems: "trash",
  junkemail: "spam",
};

function mapFolder(displayName: string | undefined): string {
  if (!displayName) return "inbox";
  const k = displayName.toLowerCase().replace(/\s+/g, "");
  return FOLDER_MAP[k] ?? displayName.toLowerCase();
}

function recipientsToJson(rs?: GraphRecipient[]): { name: string | null; address: string }[] {
  return (rs ?? [])
    .map((r) => r.emailAddress)
    .filter((a): a is GraphAddress => !!a?.address)
    .map((a) => ({ name: a.name ?? null, address: (a.address ?? "").toLowerCase() }));
}

/** Run delta sync for one account. Page through all results, upsert
 *  threads + messages, persist new delta token. */
export async function syncAccountById(
  accountId: string,
  fullBootstrap = false,
): Promise<{
  upserted: number;
  newDeltaToken: string | null;
}> {
  const creds = readMicrosoftCredentials();
  if (!creds) throw new Error("Microsoft credentials are not configured.");

  const client = admin();
  const { data: acct, error: acctErr } = await client
    .from("connected_email_accounts")
    .select(
      "id, user_id, provider, email_address, access_token_encrypted, refresh_token_encrypted, token_expires_at, delta_token",
    )
    .eq("id", accountId)
    .maybeSingle();
  if (acctErr) throw new Error(acctErr.message);
  if (!acct) throw new Error("Account not found.");
  if (acct.provider !== "microsoft") {
    throw new Error(`Sync not implemented for provider: ${acct.provider}`);
  }

  await client
    .from("connected_email_accounts")
    .update({ sync_status: "syncing", sync_error: null })
    .eq("id", accountId);

  try {
    const accessToken = await getValidAccessToken(client, acct, creds);

    // Resolve folder id -> name for top-of-mailbox lookups (just inbox + sent for now).
    const folderNames = await fetchFolderMap(accessToken);

    let nextLink: string | null = null;
    let deltaLink: string | null = null;
    let totalUpserted = 0;

    if (acct.delta_token && !fullBootstrap) {
      // Resume from saved deltaLink
      nextLink = acct.delta_token;
    } else {
      // Initial: last 30 days, sorted by receivedDateTime desc
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const params = new URLSearchParams({
        $select:
          "id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,isDraft,hasAttachments,internetMessageId,parentFolderId",
        $top: "50",
        $filter: `receivedDateTime ge ${since}`,
      });
      nextLink = `https://graph.microsoft.com/v1.0/me/messages/delta?${params.toString()}`;
    }

    // Hard cap to keep first sync bounded.
    const PAGE_CAP = 20;
    let pages = 0;
    while (nextLink && pages < PAGE_CAP) {
      pages++;
      const res = await fetch(nextLink, {
        headers: { Authorization: `Bearer ${accessToken}`, Prefer: "odata.maxpagesize=50" },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Graph delta failed: ${res.status} ${txt}`);
      }
      const json = (await res.json()) as {
        value: GraphMessage[];
        "@odata.nextLink"?: string;
        "@odata.deltaLink"?: string;
      };
      const upserted = await persistGraphPage(client, acct, json.value ?? [], folderNames);
      totalUpserted += upserted;
      nextLink = json["@odata.nextLink"] ?? null;
      if (json["@odata.deltaLink"]) deltaLink = json["@odata.deltaLink"];
    }

    await client
      .from("connected_email_accounts")
      .update({
        sync_status: "idle",
        sync_error: null,
        last_synced_at: new Date().toISOString(),
        delta_token: deltaLink ?? acct.delta_token,
      })
      .eq("id", accountId);

    return { upserted: totalUpserted, newDeltaToken: deltaLink };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await client
      .from("connected_email_accounts")
      .update({ sync_status: "error", sync_error: msg.slice(0, 500) })
      .eq("id", accountId);
    throw e;
  }
}

async function fetchFolderMap(accessToken: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      "https://graph.microsoft.com/v1.0/me/mailFolders?$top=50&$select=id,displayName",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return {};
    const json = (await res.json()) as { value: { id: string; displayName: string }[] };
    const out: Record<string, string> = {};
    for (const f of json.value ?? []) out[f.id] = f.displayName;
    return out;
  } catch {
    return {};
  }
}

async function persistGraphPage(
  client: SupabaseClient,
  account: AccountRow,
  messages: GraphMessage[],
  folderNames: Record<string, string>,
): Promise<number> {
  if (messages.length === 0) return 0;

  // Group by conversation
  const threadIdsToTouch = new Set<string>();

  for (const m of messages) {
    if (m["@removed"]) {
      // Best-effort delete; preserve thread row.
      await client
        .from("tracked_emails")
        .delete()
        .eq("account_id", account.id)
        .eq("provider_message_id", m.id);
      continue;
    }
    if (!m.conversationId) continue;

    // Upsert thread (idempotent via composite key)
    const folder = mapFolder(folderNames[m.parentFolderId ?? ""] ?? "inbox");
    const subject = m.subject ?? "(no subject)";
    const sentAt = m.receivedDateTime ?? m.sentDateTime ?? null;
    const fromAddr = m.from?.emailAddress?.address?.toLowerCase() ?? null;
    const fromName = m.from?.emailAddress?.name ?? null;
    const toJson = recipientsToJson(m.toRecipients);
    const ccJson = recipientsToJson(m.ccRecipients);
    const bccJson = recipientsToJson(m.bccRecipients);
    const participants = [
      ...(fromAddr ? [{ name: fromName, address: fromAddr, role: "from" as const }] : []),
      ...toJson.map((p) => ({ ...p, role: "to" as const })),
      ...ccJson.map((p) => ({ ...p, role: "cc" as const })),
    ];

    const { data: threadRow, error: tErr } = await client
      .from("tracked_email_threads")
      .upsert(
        {
          account_id: account.id,
          provider_thread_id: m.conversationId,
          subject,
          participants: participants,
          last_message_at: sentAt,
          snippet: m.bodyPreview ?? null,
          folder,
          has_attachments: !!m.hasAttachments,
        },
        { onConflict: "account_id,provider_thread_id" },
      )
      .select("id")
      .single();
    if (tErr) throw new Error(`thread upsert: ${tErr.message}`);
    threadIdsToTouch.add(threadRow.id);

    const bodyHtml = m.body?.contentType === "html" ? basicHtmlSanitize(m.body.content) : null;
    const bodyText = m.body?.contentType === "text" ? m.body.content : null;

    const { error: mErr } = await client.from("tracked_emails").upsert(
      {
        thread_id: threadRow.id,
        account_id: account.id,
        provider_message_id: m.id,
        from_address: fromAddr,
        from_name: fromName,
        to_addresses: toJson,
        cc_addresses: ccJson,
        bcc_addresses: bccJson,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        sent_at: sentAt,
        is_read: !!m.isRead,
        is_draft: !!m.isDraft,
        has_attachments: !!m.hasAttachments,
        in_reply_to: m.internetMessageId ?? null,
        raw_headers: {},
      },
      { onConflict: "account_id,provider_message_id" },
    );
    if (mErr) throw new Error(`message upsert: ${mErr.message}`);
  }

  // Refresh denormalized thread aggregates
  for (const tid of threadIdsToTouch) {
    const { data: agg } = await client
      .from("tracked_emails")
      .select("id, is_read, sent_at, has_attachments")
      .eq("thread_id", tid);
    if (!agg) continue;
    const unread = agg.filter((x) => !x.is_read).length;
    const lastAt =
      agg
        .map((x) => x.sent_at)
        .filter((x): x is string => !!x)
        .sort()
        .at(-1) ?? null;
    const hasAtt = agg.some((x) => x.has_attachments);
    await client
      .from("tracked_email_threads")
      .update({
        message_count: agg.length,
        unread_count: unread,
        last_message_at: lastAt,
        has_attachments: hasAtt,
      })
      .eq("id", tid);
  }

  return messages.length;
}

/** Mark a single message as read on Microsoft Graph. */
export async function markMessageReadGraph(
  accountId: string,
  providerMessageId: string,
  isRead: boolean,
): Promise<void> {
  const creds = readMicrosoftCredentials();
  if (!creds) return;
  const client = admin();
  const { data: acct } = await client
    .from("connected_email_accounts")
    .select(
      "id, user_id, provider, email_address, access_token_encrypted, refresh_token_encrypted, token_expires_at, delta_token",
    )
    .eq("id", accountId)
    .maybeSingle();
  if (!acct || acct.provider !== "microsoft") return;
  const token = await getValidAccessToken(client, acct, creds);
  await fetch(`https://graph.microsoft.com/v1.0/me/messages/${providerMessageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isRead }),
  }).catch(() => undefined);
}
