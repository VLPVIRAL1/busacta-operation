// Server functions for the Admin → Email Integration settings page.
// Config is stored in integration_credentials (key = 'email_notifications').
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const INTEGRATION_KEY = "email_notifications";

// ── Helpers ────────────────────────────────────────────────────────────────

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
  if (!data || data.length === 0) throw new Error("Forbidden");
}

async function enqueueEmail(payload: {
  to: string;
  subject: string;
  html: string;
  template_name: string;
  from_name?: string;
  reply_to?: string;
}) {
  const { sendEmail } = await import("./send.server");
  await sendEmail({
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    fromName: payload.from_name,
    replyTo: payload.reply_to,
  });
}

// ── Types ──────────────────────────────────────────────────────────────────

export type EmailNotificationConfig = {
  sender_name: string;
  reply_to: string;
  is_active: boolean;
  notify_on_assigned: boolean;
  notify_on_status: boolean;
  notify_on_commented: boolean;
  notify_on_due_soon: boolean;
  password_emails_enabled: boolean;
  report_emails_enabled: boolean;
  report_recipients: string;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
};

const DEFAULT_CONFIG: Omit<
  EmailNotificationConfig,
  "last_tested_at" | "last_test_status" | "last_test_error"
> = {
  sender_name: "",
  reply_to: "",
  is_active: false,
  notify_on_assigned: true,
  notify_on_status: true,
  notify_on_commented: true,
  notify_on_due_soon: true,
  password_emails_enabled: true,
  report_emails_enabled: false,
  report_recipients: "",
};

// ── Get config ─────────────────────────────────────────────────────────────

export const getEmailNotificationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailNotificationConfig> => {
    await assertAdmin(context.supabase, context.userId);

    const { data, error } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active, last_tested_at, last_test_status, last_test_error")
      .eq("integration_key", INTEGRATION_KEY)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return {
        ...DEFAULT_CONFIG,
        last_tested_at: null,
        last_test_status: null,
        last_test_error: null,
      };
    }

    const row = data as {
      config: Record<string, unknown>;
      is_active: boolean;
      last_tested_at: string | null;
      last_test_status: string | null;
      last_test_error: string | null;
    };
    const cfg = row.config ?? {};

    return {
      sender_name: (cfg.sender_name as string) ?? "",
      reply_to: (cfg.reply_to as string) ?? "",
      is_active: row.is_active,
      notify_on_assigned: cfg.notify_on_assigned !== false,
      notify_on_status: cfg.notify_on_status !== false,
      notify_on_commented: cfg.notify_on_commented !== false,
      notify_on_due_soon: cfg.notify_on_due_soon !== false,
      password_emails_enabled: cfg.password_emails_enabled !== false,
      report_emails_enabled: cfg.report_emails_enabled === true,
      report_recipients: (cfg.report_recipients as string) ?? "",
      last_tested_at: row.last_tested_at,
      last_test_status: row.last_test_status,
      last_test_error: row.last_test_error,
    };
  });

// ── Save config ────────────────────────────────────────────────────────────

const SaveSchema = z.object({
  sender_name: z.string().max(120).optional(),
  reply_to: z.string().email().or(z.literal("")).optional(),
  is_active: z.boolean().optional(),
  notify_on_assigned: z.boolean().optional(),
  notify_on_status: z.boolean().optional(),
  notify_on_commented: z.boolean().optional(),
  notify_on_due_soon: z.boolean().optional(),
  password_emails_enabled: z.boolean().optional(),
  report_emails_enabled: z.boolean().optional(),
  report_recipients: z.string().max(2000).optional(),
});

export const saveEmailNotificationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }): Promise<void> => {
    await assertAdmin(context.supabase, context.userId);

    // Fetch current config so we can merge (never clobber fields we didn't touch)
    const { data: existing } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active")
      .eq("integration_key", INTEGRATION_KEY)
      .maybeSingle();

    const currentCfg = (existing as { config?: Record<string, unknown> } | null)?.config ?? {};
    const newIsActive =
      data.is_active ?? (existing as { is_active?: boolean } | null)?.is_active ?? false;

    const mergedConfig = {
      ...currentCfg,
      ...(data.sender_name !== undefined && { sender_name: data.sender_name }),
      ...(data.reply_to !== undefined && { reply_to: data.reply_to }),
      ...(data.notify_on_assigned !== undefined && { notify_on_assigned: data.notify_on_assigned }),
      ...(data.notify_on_status !== undefined && { notify_on_status: data.notify_on_status }),
      ...(data.notify_on_commented !== undefined && {
        notify_on_commented: data.notify_on_commented,
      }),
      ...(data.notify_on_due_soon !== undefined && { notify_on_due_soon: data.notify_on_due_soon }),
      ...(data.password_emails_enabled !== undefined && {
        password_emails_enabled: data.password_emails_enabled,
      }),
      ...(data.report_emails_enabled !== undefined && {
        report_emails_enabled: data.report_emails_enabled,
      }),
      ...(data.report_recipients !== undefined && { report_recipients: data.report_recipients }),
    };

    const { error } = await supabaseAdmin.from("integration_credentials" as never).upsert(
      {
        integration_key: INTEGRATION_KEY,
        display_name: "Email Notifications",
        config: mergedConfig,
        is_active: newIsActive,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      } as never,
      { onConflict: "integration_key" },
    );

    if (error) throw new Error(error.message);
  });

// ── Test email ─────────────────────────────────────────────────────────────

export const testEmailConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ to: z.string().email() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    await assertAdmin(context.supabase, context.userId);

    // Read current sender settings
    const { data: existing } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config")
      .eq("integration_key", INTEGRATION_KEY)
      .maybeSingle();

    const cfg = (existing as { config?: Record<string, unknown> } | null)?.config ?? {};
    const senderName = (cfg.sender_name as string | undefined)?.trim() || undefined;
    const replyTo = (cfg.reply_to as string | undefined)?.trim() || undefined;

    try {
      await enqueueEmail({
        to: data.to,
        subject: "BusAcTa Operations — Email Integration Test",
        html: `<!doctype html><html><body style="margin:0;background:#fff;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px" cellspacing="0" cellpadding="0">
        <tr><td>
          <h1 style="font-size:20px;margin:0 0 12px">Email integration is working ✓</h1>
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px">
            This is a test email sent from <strong>BusAcTa Operations Admin → Integration → Email</strong>.
            ${senderName ? `<br/>Sender: <strong>${senderName}</strong>` : ""}
          </p>
          <p style="color:#94a3b8;font-size:12px;margin:0">
            If you didn't expect this, please contact your administrator.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
        template_name: "email_integration_test",
        ...(senderName && { from_name: senderName }),
        ...(replyTo && { reply_to: replyTo }),
      });

      // Record test result
      await supabaseAdmin
        .from("integration_credentials" as never)
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: "ok",
          last_test_error: null,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        } as never)
        .eq("integration_key", INTEGRATION_KEY);

      return { ok: true };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);

      await supabaseAdmin
        .from("integration_credentials" as never)
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: "failed",
          last_test_error: errMsg,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        } as never)
        .eq("integration_key", INTEGRATION_KEY);

      return { ok: false, error: errMsg };
    }
  });

// ── SMTP config (stored in integration_credentials key = "smtp") ───────────

const SMTP_KEY = "smtp";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean; // true = TLS (port 465), false = STARTTLS (port 587)
  user: string;
  password: string; // stored encrypted at rest by Supabase
  from_email: string;
  from_name: string;
  // metadata
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
};

const DEFAULT_SMTP: SmtpConfig = {
  host: "",
  port: 465,
  secure: true,
  user: "",
  password: "",
  from_email: "",
  from_name: "",
  is_active: false,
  last_tested_at: null,
  last_test_status: null,
  last_test_error: null,
};

export const getSmtpConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SmtpConfig> => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active, last_tested_at, last_test_status, last_test_error")
      .eq("integration_key", SMTP_KEY)
      .maybeSingle();
    if (!data) return DEFAULT_SMTP;
    const row = data as {
      config: Record<string, unknown>;
      is_active: boolean;
      last_tested_at: string | null;
      last_test_status: string | null;
      last_test_error: string | null;
    };
    const c = row.config ?? {};
    return {
      host: (c.host as string) ?? "",
      port: (c.port as number) ?? 465,
      secure: c.secure !== false,
      user: (c.user as string) ?? "",
      password: (c.password as string) ?? "",
      from_email: (c.from_email as string) ?? "",
      from_name: (c.from_name as string) ?? "",
      is_active: row.is_active,
      last_tested_at: row.last_tested_at,
      last_test_status: row.last_test_status,
      last_test_error: row.last_test_error,
    };
  });

// Helper: when activating a provider, deactivate the other one.
async function deactivateOtherEmailProviders(except: string): Promise<void> {
  await supabaseAdmin
    .from("integration_credentials" as never)
    .update({ is_active: false, updated_at: new Date().toISOString() } as never)
    .in(
      "integration_key" as never,
      ["smtp", "resend"].filter((k) => k !== except),
    );
}

const SmtpSaveSchema = z.object({
  host: z.string().max(253).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.string().max(320).optional(),
  password: z.string().max(1024).optional(),
  from_email: z.string().email().or(z.literal("")).optional(),
  from_name: z.string().max(120).optional(),
  is_active: z.boolean().optional(),
});

export const saveSmtpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SmtpSaveSchema.parse(input))
  .handler(async ({ data, context }): Promise<void> => {
    await assertAdmin(context.supabase, context.userId);
    const { data: existing } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active")
      .eq("integration_key", SMTP_KEY)
      .maybeSingle();
    const currentCfg = (existing as { config?: Record<string, unknown> } | null)?.config ?? {};
    const newIsActive =
      data.is_active ?? (existing as { is_active?: boolean } | null)?.is_active ?? false;
    const mergedConfig = {
      ...currentCfg,
      ...(data.host !== undefined && { host: data.host }),
      ...(data.port !== undefined && { port: data.port }),
      ...(data.secure !== undefined && { secure: data.secure }),
      ...(data.user !== undefined && { user: data.user }),
      ...(data.password !== undefined && data.password !== "" && { password: data.password }),
      ...(data.from_email !== undefined && { from_email: data.from_email }),
      ...(data.from_name !== undefined && { from_name: data.from_name }),
    };
    // Mutual exclusion: activating SMTP deactivates Resend.
    if (newIsActive) await deactivateOtherEmailProviders(SMTP_KEY);
    const { error } = await supabaseAdmin.from("integration_credentials" as never).upsert(
      {
        integration_key: SMTP_KEY,
        display_name: "SMTP Email",
        config: mergedConfig,
        is_active: newIsActive,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      } as never,
      { onConflict: "integration_key" },
    );
    if (error) throw new Error(error.message);
  });

export const testSmtpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ to: z.string().email() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    await assertAdmin(context.supabase, context.userId);
    try {
      const { sendEmail } = await import("./send.server");
      await sendEmail({
        to: data.to,
        subject: "BusAcTa Operations — SMTP Connection Test",
        html: `<!doctype html><html><body style="margin:0;background:#fff;font-family:Inter,Arial,sans-serif">
<table width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
  <tr><td align="center">
    <table width="100%" style="max-width:520px" cellspacing="0" cellpadding="0">
      <tr><td>
        <h1 style="font-size:20px;margin:0 0 12px">SMTP is working ✓</h1>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px">
          This test email was sent from <strong>BusAcTa Operations Admin → Integration → Email</strong>
          via your Hostinger SMTP credentials.
        </p>
        <p style="color:#94a3b8;font-size:12px;margin:0">
          If you didn't expect this, contact your administrator.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      });
      await supabaseAdmin
        .from("integration_credentials" as never)
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: "ok",
          last_test_error: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("integration_key", SMTP_KEY);
      return { ok: true };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("integration_credentials" as never)
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: "failed",
          last_test_error: errMsg,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("integration_key", SMTP_KEY);
      return { ok: false, error: errMsg };
    }
  });

// ── Resend config (stored in integration_credentials key = "resend") ───────

const RESEND_KEY = "resend";

export type ResendConfig = {
  api_key: string;
  from_email: string;
  from_name: string;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
};

const DEFAULT_RESEND: ResendConfig = {
  api_key: "",
  from_email: "",
  from_name: "",
  is_active: false,
  last_tested_at: null,
  last_test_status: null,
  last_test_error: null,
};

export const getResendConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResendConfig> => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active, last_tested_at, last_test_status, last_test_error")
      .eq("integration_key", RESEND_KEY)
      .maybeSingle();
    if (!data) return DEFAULT_RESEND;
    const row = data as {
      config: Record<string, unknown>;
      is_active: boolean;
      last_tested_at: string | null;
      last_test_status: string | null;
      last_test_error: string | null;
    };
    const c = row.config ?? {};
    return {
      api_key: (c.api_key as string) ?? "",
      from_email: (c.from_email as string) ?? "",
      from_name: (c.from_name as string) ?? "",
      is_active: row.is_active,
      last_tested_at: row.last_tested_at,
      last_test_status: row.last_test_status,
      last_test_error: row.last_test_error,
    };
  });

const ResendSaveSchema = z.object({
  api_key: z.string().max(256).optional(),
  from_email: z.string().email().or(z.literal("")).optional(),
  from_name: z.string().max(120).optional(),
  is_active: z.boolean().optional(),
});

export const saveResendConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResendSaveSchema.parse(input))
  .handler(async ({ data, context }): Promise<void> => {
    await assertAdmin(context.supabase, context.userId);
    const { data: existing } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active")
      .eq("integration_key", RESEND_KEY)
      .maybeSingle();
    const currentCfg = (existing as { config?: Record<string, unknown> } | null)?.config ?? {};
    const newIsActive =
      data.is_active ?? (existing as { is_active?: boolean } | null)?.is_active ?? false;
    const mergedConfig = {
      ...currentCfg,
      // Only overwrite api_key if a non-empty value was submitted (masked placeholder guard)
      ...(data.api_key !== undefined && data.api_key !== "" && data.api_key !== "re_••••••••"
        ? { api_key: data.api_key }
        : {}),
      ...(data.from_email !== undefined && { from_email: data.from_email }),
      ...(data.from_name !== undefined && { from_name: data.from_name }),
    };
    // Mutual exclusion: activating Resend deactivates SMTP.
    if (newIsActive) await deactivateOtherEmailProviders(RESEND_KEY);
    const { error } = await supabaseAdmin.from("integration_credentials" as never).upsert(
      {
        integration_key: RESEND_KEY,
        display_name: "Resend",
        config: mergedConfig,
        is_active: newIsActive,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      } as never,
      { onConflict: "integration_key" },
    );
    if (error) throw new Error(error.message);
  });

export const testResendConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ to: z.string().email() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    await assertAdmin(context.supabase, context.userId);
    try {
      const { sendEmail } = await import("./send.server");
      await sendEmail({
        to: data.to,
        subject: "BusAcTa Operations — Resend Connection Test",
        html: `<!doctype html><html><body style="margin:0;background:#fff;font-family:Inter,Arial,sans-serif">
<table width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
  <tr><td align="center">
    <table width="100%" style="max-width:520px" cellspacing="0" cellpadding="0">
      <tr><td>
        <h1 style="font-size:20px;margin:0 0 12px">Resend is working ✓</h1>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px">
          Test email sent from <strong>BusAcTa Operations Admin → Integration → Email</strong> via Resend.
        </p>
        <p style="color:#94a3b8;font-size:12px;margin:0">
          If you didn't expect this, contact your administrator.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      });
      await supabaseAdmin
        .from("integration_credentials" as never)
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: "ok",
          last_test_error: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("integration_key", RESEND_KEY);
      return { ok: true };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("integration_credentials" as never)
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: "failed",
          last_test_error: errMsg,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("integration_key", RESEND_KEY);
      return { ok: false, error: errMsg };
    }
  });

// ── Active provider query (used by send.server.ts and the UI) ──────────────

export const getActiveEmailProvider = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<"smtp" | "resend" | null> => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("integration_key")
      .in("integration_key" as never, ["smtp", "resend"])
      .eq("is_active" as never, true)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const key = (data as { integration_key: string }).integration_key;
    return key === "smtp" || key === "resend" ? key : null;
  });

// ── Queue stats ────────────────────────────────────────────────────────────

export type EmailQueueStats = {
  pending: number;
  sent_today: number;
  failed: number;
};

export const getEmailQueueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailQueueStats> => {
    await assertAdmin(context.supabase, context.userId);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pendingRes, sentTodayRes, failedRes] = await Promise.all([
      supabaseAdmin
        .from("email_notification_queue" as never)
        .select("id", { count: "exact", head: true })
        .is("sent_at", null)
        .is("error", null),
      supabaseAdmin
        .from("email_notification_queue" as never)
        .select("id", { count: "exact", head: true })
        .not("sent_at", "is", null)
        .gte("sent_at", todayStart.toISOString()),
      supabaseAdmin
        .from("email_notification_queue" as never)
        .select("id", { count: "exact", head: true })
        .not("error", "is", null),
    ]);

    return {
      pending: pendingRes.count ?? 0,
      sent_today: sentTodayRes.count ?? 0,
      failed: failedRes.count ?? 0,
    };
  });
