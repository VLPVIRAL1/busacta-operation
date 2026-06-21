import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Header KPI counts on `/dashboard`: firms, projects, open tasks, and the
 * current user's logged hours.
 *
 * Key kept identical to the previous inline query so cached data survives
 * the refactor.
 */
export const dashboardStatsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["dashboard-stats", userId],
    queryFn: async () => {
      const [firms, projects, tasks, time] = await Promise.all([
        supabase.from("firms").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("tasks").select("id", { count: "exact", head: true }),
        supabase.from("time_logs").select("duration_minutes").eq("user_id", userId),
      ]);
      const totalMin = (time.data ?? []).reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
      return {
        firms: firms.count ?? 0,
        projects: projects.count ?? 0,
        tasks: tasks.count ?? 0,
        hours: Math.round((totalMin / 60) * 10) / 10,
      };
    },
  });

export type StaffMember = {
  id: string;
  full_name: string | null;
  email: string | null;
};

/**
 * Internal staff (admin + employee) for the Daily Activity user picker.
 */
export const staffListQuery = () =>
  queryOptions({
    queryKey: ["staff-list"],
    queryFn: async (): Promise<StaffMember[]> => {
      const { data: r } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "employee"]);
      const ids = Array.from(new Set((r ?? []).map((x) => x.user_id)));
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids)
        .eq("status", "active");
      return (data ?? []) as StaffMember[];
    },
  });

export type DailyActivityCtx = {
  taskTitle: string;
  entityName: string;
  projectName: string;
  firmId: string;
  firmName: string;
};

/**
 * One user's day-of-activity: messages authored, time logs started, and
 * audit events. Joined with task → entity → project → firm context.
 */
export const dailyActivityQuery = (date: string, targetUserId: string | undefined) =>
  queryOptions({
    queryKey: ["daily-activity", date, targetUserId],
    queryFn: async () => {
      const userId = targetUserId!;
      const start = `${date}T00:00:00`;
      const end = `${date}T23:59:59`;
      const [msgs, time, audits] = await Promise.all([
        supabase
          .from("task_messages")
          .select("id, body, task_id, created_at, edited_at")
          .eq("author_id", userId)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false }),
        supabase
          .from("time_logs")
          .select("id, task_id, duration_minutes, started_at, ended_at, note")
          .eq("user_id", userId)
          .gte("started_at", start)
          .lte("started_at", end),
        supabase
          .from("task_audit")
          .select("id, task_id, event_type, payload, created_at")
          .eq("actor_id", userId)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false }),
      ]);

      const taskIds = Array.from(
        new Set(
          [
            ...(msgs.data ?? []).map((m) => m.task_id),
            ...(time.data ?? []).map((t) => t.task_id),
            ...(audits.data ?? []).map((a) => a.task_id),
          ].filter(Boolean) as string[],
        ),
      );

      const ctx = new Map<string, DailyActivityCtx>();
      if (taskIds.length) {
        const { data: tRows } = await supabase
          .from("tasks")
          .select(
            "id, title, client_entities!inner(name, projects!inner(name, firm_id, firms!inner(name)))",
          )
          .in("id", taskIds);
        for (const t of tRows ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ent: any = (t as any).client_entities;
          const proj = ent?.projects;
          const firm = proj?.firms;
          ctx.set(t.id as string, {
            taskTitle: (t as { title: string }).title,
            entityName: ent?.name ?? "—",
            projectName: proj?.name ?? "—",
            firmId: proj?.firm_id ?? "",
            firmName: firm?.name ?? "—",
          });
        }
      }

      const totalMin = (time.data ?? []).reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
      return {
        messages: msgs.data ?? [],
        time: time.data ?? [],
        audits: audits.data ?? [],
        totalMin,
        ctx,
      };
    },
  });
