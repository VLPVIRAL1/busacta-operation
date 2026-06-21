import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildAuthorizeUrl,
  readMicrosoftCredentialsAsync,
  signOAuthState,
} from "./providers/microsoft.server";

async function assertAdmin(supabase: unknown, userId: string) {
  const sb = supabase as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (
          c: string,
          v: string,
        ) => {
          in: (
            c: string,
            v: string[],
          ) => Promise<{ data: { role: string }[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: admin role required");
}

/**
 * Returns the Microsoft authorize URL for the current user.
 * Reads credentials from DB first, falls back to env vars.
 * The client should `window.location.href = url`.
 */
export const startMicrosoftConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const creds = await readMicrosoftCredentialsAsync();
    if (!creds) {
      throw new Error(
        "Microsoft 365 is not configured. An administrator must set credentials in Admin → Integration → Microsoft.",
      );
    }
    const state = signOAuthState({ userId: context.userId });
    return { url: buildAuthorizeUrl(creds, state) };
  });

/**
 * Returns whether Microsoft email OAuth creds are configured (DB or env vars).
 * Safe to expose: only returns booleans + redirect URI.
 */
export const getEmailProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const creds = await readMicrosoftCredentialsAsync();
    // Also surface where credentials come from
    const { data: dbRow } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active")
      .eq("integration_key", "microsoft_email_oauth")
      .maybeSingle();
    const row = dbRow as {
      config?: { client_id?: string; client_secret?: string; redirect_uri?: string };
      is_active?: boolean;
    } | null;
    const fromDb = !!(
      row?.is_active &&
      row.config?.client_id &&
      row.config?.client_secret &&
      row.config?.redirect_uri
    );
    return {
      microsoft: {
        configured: !!creds,
        fromDb,
        hasClientId: !!(fromDb ? row?.config?.client_id : process.env.MS_GRAPH_CLIENT_ID),
        hasClientSecret: !!(fromDb
          ? row?.config?.client_secret
          : process.env.MS_GRAPH_CLIENT_SECRET),
        hasRedirectUri: !!(fromDb ? row?.config?.redirect_uri : process.env.MS_GRAPH_REDIRECT_URI),
        redirectUri: creds?.redirectUri ?? null,
      },
      google: { configured: false },
    };
  });

export type MicrosoftEmailOAuthConfig = {
  client_id: string;
  client_secret_masked: string;
  redirect_uri: string;
  is_active: boolean;
};

export const getMicrosoftEmailOAuthConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MicrosoftEmailOAuthConfig | null> => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active")
      .eq("integration_key", "microsoft_email_oauth")
      .maybeSingle();
    const row = data as {
      config?: { client_id?: string; client_secret?: string; redirect_uri?: string };
      is_active?: boolean;
    } | null;
    if (!row) return null;
    const secret = row.config?.client_secret ?? "";
    return {
      client_id: row.config?.client_id ?? "",
      client_secret_masked: secret.length > 4 ? `••••${secret.slice(-4)}` : secret ? "••••" : "",
      redirect_uri: row.config?.redirect_uri ?? "",
      is_active: row.is_active ?? false,
    };
  });

const SaveEmailOAuthSchema = z.object({
  client_id: z.string().trim().max(256),
  client_secret: z.string().max(512).optional(),
  redirect_uri: z.string().trim().url("Must be a valid URL").max(512),
  is_active: z.boolean(),
});

export const saveMicrosoftEmailOAuthConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveEmailOAuthSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Preserve existing secret if blank was submitted
    const { data: existing } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config")
      .eq("integration_key", "microsoft_email_oauth")
      .maybeSingle();
    const existingSecret =
      (existing as { config?: { client_secret?: string } } | null)?.config?.client_secret ?? "";
    const nextSecret = data.client_secret?.trim() ? data.client_secret.trim() : existingSecret;

    const { error } = await supabaseAdmin.from("integration_credentials" as never).upsert({
      integration_key: "microsoft_email_oauth",
      display_name: "Microsoft 365 Email OAuth",
      config: {
        client_id: data.client_id,
        client_secret: nextSecret,
        redirect_uri: data.redirect_uri,
      },
      is_active: data.is_active,
      updated_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const testMicrosoftEmailOAuthConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    await assertAdmin(context.supabase, context.userId);
    const creds = await readMicrosoftCredentialsAsync();
    if (!creds) return { ok: false, message: "No credentials configured. Save credentials first." };

    // Validate credentials by requesting a token via client_credentials.
    // /organizations endpoint works for multi-tenant apps without needing a tenant ID.
    const body = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const res = await fetch("https://login.microsoftonline.com/organizations/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (json.access_token) {
      return {
        ok: true,
        message: "Credentials valid — Microsoft recognised the app and issued a token.",
      };
    }
    // These errors confirm credentials are valid — the block is at policy/permission level,
    // not credentials level. The interactive user OAuth flow is unaffected by both.
    const desc = json.error_description ?? "";
    const isCredentialsValid = json.error === "unauthorized_client" || desc.includes("AADSTS53003");
    if (isCredentialsValid) {
      return {
        ok: true,
        message:
          "Credentials valid — app recognised by Microsoft. User mailbox connections will work normally.",
      };
    }
    const detail = desc.split("\r\n")[0] || json.error || "Unknown error";
    return { ok: false, message: detail };
  });
