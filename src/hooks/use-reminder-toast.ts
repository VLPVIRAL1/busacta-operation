import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/error/notify";
import { useAuth } from "@/lib/auth/auth-context";
import { subscribeChannel } from "@/lib/realtime/channel-registry";

const CHECK_INTERVAL_MS = 60_000; // check every minute

/**
 * Shows an on-screen toast when a personal reminder comes due.
 * Also inserts a `notifications` row (kind: "reminder") so it appears
 * in the bell inbox. Fires at most once per reminder per browser session.
 */
export function useReminderToast() {
  const { user } = useAuth();
  const notifiedIds = useRef<Set<string>>(new Set());

  async function checkDue(userId: string) {
    const { data } = await supabase
      .from("personal_reminders")
      .select("id, body, remind_at")
      .eq("user_id", userId)
      .is("completed_at", null)
      .lte("remind_at", new Date().toISOString())
      .order("remind_at", { ascending: true });

    for (const r of data ?? []) {
      if (notifiedIds.current.has(r.id)) continue;
      notifiedIds.current.add(r.id);
      // Persist so page-refresh doesn't re-fire the same reminder
      try {
        window.sessionStorage.setItem(
          `reminder-toasted-${userId}`,
          JSON.stringify(Array.from(notifiedIds.current)),
        );
      } catch {
        /* ignore */
      }

      const title = "Reminder";
      const body = r.body?.slice(0, 120) ?? undefined;

      // Insert into notifications table; NotificationsBell's realtime subscription
      // will show the toast — no need to call toast() here too.
      void notify({
        user_ids: [userId],
        kind: "reminder",
        title,
        body: body ?? null,
        url: "/ops/notifications",
      });
    }
  }

  useEffect(() => {
    if (!user) return;
    const uid = user.id;

    // Restore previously-fired IDs from sessionStorage to avoid re-notifying on page refresh
    try {
      const stored = window.sessionStorage.getItem(`reminder-toasted-${uid}`);
      if (stored) notifiedIds.current = new Set(JSON.parse(stored) as string[]);
    } catch {
      /* ignore */
    }

    void checkDue(uid);
    const timer = setInterval(() => void checkDue(uid), CHECK_INTERVAL_MS);

    // Also re-check whenever personal_reminders change (e.g. a new one is added)
    const unsub = subscribeChannel(`reminders-due-${uid}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "personal_reminders",
          filter: `user_id=eq.${uid}`,
        },
        () => void checkDue(uid),
      ),
    );

    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [user]);
}
