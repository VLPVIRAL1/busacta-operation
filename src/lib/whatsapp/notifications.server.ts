// Processes the whatsapp_notification_queue: looks up each user's enrolled
// WhatsApp channel and notification preferences, then delivers via Twilio.
// Called by the cron endpoint — uses service-role client (bypasses RLS).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppMessage } from "./client.server";
import {
  taskAssignedMessage,
  taskStatusChangedMessage,
  taskCommentedMessage,
  taskDueSoonMessage,
  taskOverdueMessage,
} from "./templates";

type QueueRow = {
  id: string;
  user_id: string;
  notification_type: string;
  task_id: string | null;
  task_title: string | null;
  actor_name: string | null;
  extra: Record<string, string> | null;
};

// Process up to `limit` pending queue entries. Returns counts.
export async function processNotificationQueue(limit = 100): Promise<{
  sent: number;
  skipped: number;
  failed: number;
}> {
  const { data: rows, error } = await supabaseAdmin
    .from("whatsapp_notification_queue" as never)
    .select("id, user_id, notification_type, task_id, task_title, actor_name, extra")
    .is("sent_at", null)
    .is("error", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Queue read failed: ${error.message}`);
  const queue = (rows ?? []) as QueueRow[];

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of queue) {
    try {
      const result = await deliverOne(row);
      if (result === "skipped") {
        skipped++;
        // Mark skipped so it doesn't retry (no phone / opted out)
        await supabaseAdmin
          .from("whatsapp_notification_queue" as never)
          .update({ sent_at: new Date().toISOString() } as never)
          .eq("id", row.id);
      } else {
        sent++;
        await supabaseAdmin
          .from("whatsapp_notification_queue" as never)
          .update({ sent_at: new Date().toISOString() } as never)
          .eq("id", row.id);
      }
    } catch (e) {
      failed++;
      const errMsg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("whatsapp_notification_queue" as never)
        .update({ error: errMsg } as never)
        .eq("id", row.id);
    }
  }

  return { sent, skipped, failed };
}

async function deliverOne(row: QueueRow): Promise<"sent" | "skipped"> {
  // 1. Check user has a verified WhatsApp channel
  const { data: channel } = await supabaseAdmin
    .from("user_otp_channels")
    .select("destination")
    .eq("user_id", row.user_id)
    .eq("channel", "whatsapp")
    .not("verified_at", "is", null)
    .maybeSingle();

  if (!channel?.destination) return "skipped";

  // 2. Check user preferences (default: all on)
  const { data: prefs } = await supabaseAdmin
    .from("whatsapp_notification_prefs" as never)
    .select("enabled, notify_on_assigned, notify_on_status, notify_on_commented, notify_on_due_soon")
    .eq("user_id", row.user_id)
    .maybeSingle();

  const p = (prefs ?? {}) as Record<string, boolean>;
  if (p.enabled === false) return "skipped";

  const prefKey: Record<string, string> = {
    task_assigned: "notify_on_assigned",
    task_status_changed: "notify_on_status",
    task_commented: "notify_on_commented",
    task_due_soon: "notify_on_due_soon",
  };
  const prefField = prefKey[row.notification_type];
  if (prefField && p[prefField] === false) return "skipped";

  // 3. Build message
  const title = row.task_title ?? "a task";
  const actor = row.actor_name ?? "Someone";
  let body: string;

  switch (row.notification_type) {
    case "task_assigned":
      body = taskAssignedMessage(title, actor);
      break;
    case "task_status_changed":
      body = taskStatusChangedMessage(
        title,
        row.extra?.old_status ?? "",
        row.extra?.new_status ?? "",
        actor,
      );
      break;
    case "task_commented":
      body = taskCommentedMessage(title, actor);
      break;
    case "task_due_soon":
      body =
        row.extra?.overdue === "true"
          ? taskOverdueMessage(title, row.extra?.due_date ?? "")
          : taskDueSoonMessage(title, row.extra?.due_date ?? "");
      break;
    default:
      return "skipped";
  }

  // 4. Send
  await sendWhatsAppMessage(channel.destination, body);
  return "sent";
}

// Scan tasks due within `days` days that haven't been notified today,
// insert due-soon entries into the queue, and also queue overdue ones.
export async function enqueueDueSoonNotifications(
  daysAhead = 2,
): Promise<{ queued: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + daysAhead);

  // Tasks due within the window that are not yet complete
  const { data: tasks, error } = await supabaseAdmin
    .from("tasks")
    .select("id, title, due_date, assignee_id")
    .not("assignee_id", "is", null)
    .not("status", "eq", "complete")
    .lte("due_date", cutoff.toISOString().split("T")[0])
    .not("due_date", "is", null);

  if (error) throw new Error(`Due-soon scan failed: ${error.message}`);
  const list = tasks ?? [];

  // Deduplicate against queue rows created today to avoid double-sending
  const { data: todayQueue } = await supabaseAdmin
    .from("whatsapp_notification_queue" as never)
    .select("task_id, user_id")
    .in("notification_type", ["task_due_soon"])
    .gte("created_at", today.toISOString());

  const alreadyQueued = new Set(
    ((todayQueue ?? []) as { task_id: string; user_id: string }[]).map(
      (r) => `${r.task_id}:${r.user_id}`,
    ),
  );

  const rows: object[] = [];
  for (const t of list) {
    if (!t.assignee_id) continue;
    const key = `${t.id}:${t.assignee_id}`;
    if (alreadyQueued.has(key)) continue;

    const dueDate = t.due_date as string;
    const dueTs = new Date(dueDate);
    const isOverdue = dueTs < today;

    rows.push({
      user_id: t.assignee_id,
      notification_type: "task_due_soon",
      task_id: t.id,
      task_title: t.title,
      actor_name: null,
      extra: {
        due_date: dueDate,
        overdue: String(isOverdue),
      },
    });
  }

  if (rows.length > 0) {
    await supabaseAdmin.from("whatsapp_notification_queue" as never).insert(rows as never);
  }

  // Override message for overdue tasks (swap template at deliver time via extra.overdue)
  return { queued: rows.length };
}

