import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  MS_GRAPH_SCOPES,
  exchangeCodeForTokens,
  fetchUserProfile,
  readMicrosoftCredentialsAsync,
  verifyOAuthState,
} from "@/lib/email/providers/microsoft.server";
import { encryptToken } from "@/lib/auth/token-encryption.server";

function htmlResponse(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Email Hub</title>
      <style>body{font-family:system-ui,-apple-system,sans-serif;padding:2rem;max-width:560px;margin:0 auto;color:#1a1a1a}
      .card{border:1px solid #e5e7eb;border-radius:.75rem;padding:1.5rem;background:#fff}
      .err{border-color:#fecaca;background:#fef2f2;color:#991b1b}
      a.btn{display:inline-block;margin-top:1rem;padding:.5rem 1rem;background:#0f172a;color:#fff;border-radius:.5rem;text-decoration:none}
      </style></head><body>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function redirectTo(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}

export const Route = createFileRoute("/api/public/email/oauth/microsoft/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDesc = url.searchParams.get("error_description");

        if (error) {
          return htmlResponse(
            `<div class="card err"><h2>Microsoft sign-in cancelled</h2><p>${escapeHtml(errorDesc ?? error)}</p><a class="btn" href="/email/settings">Back to Email Hub</a></div>`,
            400,
          );
        }
        if (!code || !state) {
          return htmlResponse(
            `<div class="card err"><h2>Invalid callback</h2><p>Missing code or state.</p><a class="btn" href="/email/settings">Back</a></div>`,
            400,
          );
        }

        const verified = verifyOAuthState(state);
        if (!verified) {
          return htmlResponse(
            `<div class="card err"><h2>State verification failed</h2><p>This sign-in link is expired or invalid. Please retry the connection.</p><a class="btn" href="/email/settings">Back</a></div>`,
            400,
          );
        }

        const creds = await readMicrosoftCredentialsAsync();
        if (!creds) {
          return htmlResponse(
            `<div class="card err"><h2>Microsoft 365 not configured</h2><p>Server is missing MS_GRAPH_* credentials.</p><a class="btn" href="/email/settings">Back</a></div>`,
            500,
          );
        }

        try {
          const tokens = await exchangeCodeForTokens(creds, code);
          const profile = await fetchUserProfile(tokens.access_token);

          const supabaseUrl = process.env.SUPABASE_URL!;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
          const admin = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
          const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);

          // Validate that all required scopes were granted by the user.
          const requiredScopes = MS_GRAPH_SCOPES.filter(
            (s) => !["openid", "profile", "email"].includes(s),
          );
          const missingScopes = requiredScopes.filter((s) => !scopes.includes(s));
          if (missingScopes.length > 0) {
            return htmlResponse(
              `<div class="card err"><h2>Insufficient permissions</h2>
               <p>The following permissions were not granted: <strong>${escapeHtml(missingScopes.join(", "))}</strong>.</p>
               <p>Please retry and accept all requested permissions.</p>
               <a class="btn" href="/email/settings">Back to Email Hub</a></div>`,
              400,
            );
          }

          const { error: upsertErr } = await admin.from("connected_email_accounts").upsert(
            {
              user_id: verified.userId,
              provider: "microsoft",
              email_address: profile.email,
              display_name: profile.displayName,
              access_token_encrypted: encryptToken(tokens.access_token),
              refresh_token_encrypted: tokens.refresh_token
                ? encryptToken(tokens.refresh_token)
                : null,
              token_expires_at: expiresAt,
              scopes,
              sync_status: "idle",
              sync_error: null,
              is_active: true,
            },
            { onConflict: "user_id,email_address" },
          );

          if (upsertErr) {
            return htmlResponse(
              `<div class="card err"><h2>Could not save account</h2><p>${escapeHtml(upsertErr.message)}</p><a class="btn" href="/email/settings">Back</a></div>`,
              500,
            );
          }

          return redirectTo("/email/settings?connected=1");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return htmlResponse(
            `<div class="card err"><h2>Connection failed</h2><p>${escapeHtml(msg)}</p><a class="btn" href="/email/settings">Back</a></div>`,
            500,
          );
        }
      },
    },
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
