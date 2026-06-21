/**
 * send-email Edge Function — SMTP relay for BusAcTa Operations.
 *
 * Accepts a JSON POST from the Cloudflare Worker (via service-role auth),
 * loads SMTP credentials from the `integration_credentials` table, and
 * delivers the email directly over SMTP (Deno TCP — Cloudflare Workers
 * cannot open raw TCP sockets, so the Worker delegates here).
 *
 * POST body:
 *   { to: string, subject: string, html: string,
 *     from_name?: string, reply_to?: string }
 *
 * Returns:
 *   200  { ok: true }
 *   4xx  { ok: false, error: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Auth: require service-role key ────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || token !== serviceKey) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    to: string;
    subject: string;
    html: string;
    from_name?: string;
    reply_to?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.to || !body.subject || !body.html) {
    return Response.json(
      { ok: false, error: "Missing required fields: to, subject, html" },
      { status: 400 },
    );
  }

  // ── Load SMTP config from DB ──────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: row, error: dbErr } = await supabase
    .from("integration_credentials")
    .select("config, is_active")
    .eq("integration_key", "smtp")
    .maybeSingle();

  if (dbErr) {
    return Response.json({ ok: false, error: dbErr.message }, { status: 500 });
  }
  if (!row || !row.is_active) {
    return Response.json(
      {
        ok: false,
        error:
          "SMTP is not configured or not enabled. Go to Admin → Integration → Email to set it up.",
      },
      { status: 503 },
    );
  }

  const cfg = row.config as {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    from_email?: string;
    from_name?: string;
    secure?: boolean;
  };

  if (!cfg.host || !cfg.user || !cfg.password || !cfg.from_email) {
    return Response.json(
      {
        ok: false,
        error:
          "SMTP credentials incomplete. Fill in host, user, password, and From address in Admin → Integration → Email.",
      },
      { status: 503 },
    );
  }

  // ── Build From address ─────────────────────────────────────────────────────
  const displayName = (body.from_name?.trim() || cfg.from_name?.trim() || "").replace(/"/g, "");
  const fromAddress = displayName ? `"${displayName}" <${cfg.from_email}>` : cfg.from_email;

  // ── Send via SMTP ─────────────────────────────────────────────────────────
  try {
    const port = cfg.port ?? 465;
    const secure = cfg.secure ?? port === 465;

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port,
      secure,
      auth: { user: cfg.user, pass: cfg.password },
    });

    await transporter.sendMail({
      from: fromAddress,
      to: body.to,
      subject: body.subject,
      html: body.html,
      ...(body.reply_to?.trim() ? { replyTo: body.reply_to.trim() } : {}),
    });

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (err) {
    console.error("[send-email] SMTP error:", err);
    return Response.json(
      { ok: false, error: (err as Error).message ?? "SMTP delivery failed" },
      { status: 502, headers: corsHeaders },
    );
  }
});
