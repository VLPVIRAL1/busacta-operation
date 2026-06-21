// Processes the email_notification_queue: looks up each user's email address,
// builds a notification email, and delivers via the shared Resend helper.
// Called by the cron endpoint — uses service-role client (bypasses RLS).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type QueueRow = {
  id: string;
  user_id: string;
  notification_type: string;
  task_id: string | null;
  task_title: string | null;
  actor_name: string | null;
  extra: Record<string, string> | null;
};

type EmailConfig = {
  sender_name: string;
  reply_to: string;
  notify_on_due_soon: boolean;
};

// ── Main processor ─────────────────────────────────────────────────────────

export async function processEmailNotificationQueue(limit = 50): Promise<{
  sent: number;
  skipped: number;
  failed: number;
}> {
  // Read active config
  const { data: credRow } = await supabaseAdmin
    .from("integration_credentials" as never)
    .select("config, is_active")
    .eq("integration_key", "email_notifications")
    .maybeSingle();

  const cred = credRow as {
    config: Record<string, unknown>;
    is_active: boolean;
  } | null;

  if (!cred?.is_active) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const cfg: EmailConfig = {
    sender_name: (cred.config.sender_name as string) ?? "",
    reply_to: (cred.config.reply_to as string) ?? "",
    notify_on_due_soon: cred.config.notify_on_due_soon !== false,
  };

  // Fetch pending rows
  const { data: rows, error } = await supabaseAdmin
    .from("email_notification_queue" as never)
    .select("id, user_id, notification_type, task_id, task_title, actor_name, extra")
    .is("sent_at", null)
    .is("error", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Email queue read failed: ${error.message}`);

  const queue = (rows ?? []) as QueueRow[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of queue) {
    try {
      const result = await deliverOne(row, cfg);
      if (result === "skipped") {
        skipped++;
      } else {
        sent++;
      }
      await supabaseAdmin
        .from("email_notification_queue" as never)
        .update({ sent_at: new Date().toISOString() } as never)
        .eq("id", row.id);
    } catch (e) {
      failed++;
      const errMsg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("email_notification_queue" as never)
        .update({ error: errMsg } as never)
        .eq("id", row.id);
    }
  }

  return { sent, skipped, failed };
}

// ── Due-soon enqueue ───────────────────────────────────────────────────────

export async function enqueueEmailDueSoonNotifications(
  withinDays = 2,
): Promise<{ queued: number }> {
  const { data: credRow } = await supabaseAdmin
    .from("integration_credentials" as never)
    .select("config, is_active")
    .eq("integration_key", "email_notifications")
    .maybeSingle();

  const cred = credRow as {
    config: Record<string, unknown>;
    is_active: boolean;
  } | null;

  if (!cred?.is_active || cred.config.notify_on_due_soon === false) {
    return { queued: 0 };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  // Find tasks that are due soon or overdue, not done, with an assignee,
  // and not already queued today.
  const { data: tasks, error } = await supabaseAdmin
    .from("tasks" as never)
    .select("id, title, assignee_id, due_date")
    .not("assignee_id", "is", null)
    .lte("due_date", cutoff.toISOString())
    .not("status", "in", '("done","cancelled","archived")')
    .limit(200);

  if (error) throw new Error(`Due-soon query failed: ${error.message}`);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Batch dedup: one query instead of N, same approach as WhatsApp queue
  const { data: todayQueue } = await supabaseAdmin
    .from("email_notification_queue" as never)
    .select("task_id, user_id")
    .eq("notification_type", "task_due_soon")
    .gte("created_at", `${todayStr}T00:00:00Z`);

  const alreadyQueued = new Set(
    ((todayQueue ?? []) as { task_id: string; user_id: string }[]).map(
      (r) => `${r.task_id}:${r.user_id}`,
    ),
  );

  const rows: object[] = [];
  for (const task of (tasks ?? []) as {
    id: string;
    title: string;
    assignee_id: string;
    due_date: string;
  }[]) {
    if (alreadyQueued.has(`${task.id}:${task.assignee_id}`)) continue;
    const isOverdue = new Date(task.due_date) < new Date();
    rows.push({
      user_id: task.assignee_id,
      notification_type: "task_due_soon",
      task_id: task.id,
      task_title: task.title,
      actor_name: null,
      extra: { overdue: String(isOverdue), due_date: task.due_date },
    });
  }

  if (rows.length > 0) {
    await supabaseAdmin.from("email_notification_queue" as never).insert(rows as never);
  }

  return { queued: rows.length };
}

// ── Delivery ───────────────────────────────────────────────────────────────

async function deliverOne(row: QueueRow, cfg: EmailConfig): Promise<"sent" | "skipped"> {
  // Look up the user's email address
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
  const toEmail = authUser?.user?.email;
  if (!toEmail) return "skipped";

  const { subject, html } = buildEmail(row, cfg);

  await callEnqueueEmail({
    to: toEmail,
    subject,
    html,
    template_name: `email_notification_${row.notification_type}`,
    ...(cfg.sender_name?.trim() ? { from_name: cfg.sender_name.trim() } : {}),
    ...(cfg.reply_to?.trim() ? { reply_to: cfg.reply_to.trim() } : {}),
  });

  return "sent";
}

function buildEmail(row: QueueRow, _cfg: EmailConfig): { subject: string; html: string } {
  const taskTitle = row.task_title ?? "a task";
  const actor = row.actor_name ?? "Someone";

  switch (row.notification_type) {
    case "task_assigned":
      return {
        subject: `You've been assigned: ${taskTitle}`,
        html: notifHtml(
          `You've been assigned a task`,
          `<strong>${esc(actor)}</strong> assigned you to <strong>${esc(taskTitle)}</strong>.`,
          row.task_id,
        ),
      };
    case "task_status_changed": {
      const oldS = row.extra?.old_status ?? "";
      const newS = row.extra?.new_status ?? "";
      return {
        subject: `Task status updated: ${taskTitle}`,
        html: notifHtml(
          `Task status changed`,
          `<strong>${esc(taskTitle)}</strong> was moved from <strong>${esc(oldS)}</strong> to <strong>${esc(newS)}</strong> by ${esc(actor)}.`,
          row.task_id,
        ),
      };
    }
    case "task_commented":
      return {
        subject: `New comment on: ${taskTitle}`,
        html: notifHtml(
          `New comment on your task`,
          `<strong>${esc(actor)}</strong> left a comment on <strong>${esc(taskTitle)}</strong>.`,
          row.task_id,
        ),
      };
    case "task_due_soon": {
      const isOverdue = row.extra?.overdue === "true";
      return {
        subject: isOverdue ? `Overdue task: ${taskTitle}` : `Task due soon: ${taskTitle}`,
        html: notifHtml(
          isOverdue ? `Task is overdue` : `Task due soon`,
          isOverdue
            ? `Your task <strong>${esc(taskTitle)}</strong> is past its due date. Please update the status or reach out to your manager.`
            : `Your task <strong>${esc(taskTitle)}</strong> is due within 2 days. Make sure it's on track.`,
          row.task_id,
        ),
      };
    }
    default:
      return {
        subject: `BusAcTa Operations notification`,
        html: notifHtml("You have a new notification", `Task: ${esc(taskTitle)}`, row.task_id),
      };
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function notifHtml(heading: string, body: string, taskId: string | null): string {
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Inter,Arial,sans-serif;color:#0f172a">
  <table width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px" cellspacing="0" cellpadding="0">
        <tr><td>
          <h1 style="font-size:18px;margin:0 0 12px;color:#0f172a">${heading}</h1>
          <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6">${body}</p>
          ${
            taskId
              ? `<p style="margin:0 0 20px">
                   <a href="${process.env.SITE_URL ?? "https://one.busacta.com"}/tasks/${taskId}"
                      style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
                     View task
                   </a>
                 </p>`
              : ""
          }
          <p style="margin:0;color:#94a3b8;font-size:12px">
            You're receiving this because you're subscribed to task notifications in BusAcTa Operations.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function callEnqueueEmail(payload: {
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
