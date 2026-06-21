import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Read queries for the Productivity hub. Mutations stay co-located with their
 * optimistic-update logic in the route components for now — extract here
 * once a shared callsite needs them.
 */

export type ProductivitySession = {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  projects: { id: string; name: string } | null;
  tasks: { id: string; title: string } | null;
};

export type ActivityLog = {
  id: string;
  session_id: string;
  user_id: string;
  screenshot_path: string | null;
  keystrokes_count: number;
  mouse_clicks_count: number;
  active_window_title: string | null;
  active_application_name: string | null;
  activity_percentage: number;
  interval_start: string;
  interval_end: string;
  created_at: string;
  productivity_sessions: ProductivitySession | null;
};

export const activityLogsQuery = (params: {
  userId: string | null;
  dateFrom: string;
  dateTo: string;
  sessionId: string | null;
}) =>
  queryOptions({
    queryKey: ["activity-logs", params],
    queryFn: async (): Promise<ActivityLog[]> => {
      let query = supabase
        .from("activity_logs")
        .select(
          "id, session_id, user_id, screenshot_path, keystrokes_count, mouse_clicks_count, active_window_title, active_application_name, activity_percentage, interval_start, interval_end, created_at, productivity_sessions(id, user_id, project_id, task_id, started_at, ended_at, created_at, projects(id, name), tasks(id, title))",
        )
        .gte("interval_start", params.dateFrom + "T00:00:00Z")
        .lte("interval_start", params.dateTo + "T23:59:59Z")
        .order("interval_start", { ascending: false })
        .limit(500);

      if (params.userId !== null) {
        query = query.eq("user_id", params.userId);
      }
      if (params.sessionId !== null) {
        query = query.eq("session_id", params.sessionId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ActivityLog[];
    },
  });

export const productivitySessionsQuery = (params: {
  userId: string | null;
  dateFrom: string;
  dateTo: string;
}) =>
  queryOptions({
    queryKey: ["productivity-sessions", params],
    queryFn: async (): Promise<ProductivitySession[]> => {
      let query = supabase
        .from("productivity_sessions")
        .select(
          "id, user_id, project_id, task_id, started_at, ended_at, created_at, projects(id, name), tasks(id, title)",
        )
        .gte("started_at", params.dateFrom + "T00:00:00Z")
        .lte("started_at", params.dateTo + "T23:59:59Z")
        .order("started_at", { ascending: false })
        .limit(200);

      if (params.userId !== null) {
        query = query.eq("user_id", params.userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ProductivitySession[];
    },
  });
