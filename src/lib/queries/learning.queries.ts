import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

// ── Firm ID helper ────────────────────────────────────────────────────────────

export const selfFirmQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["self-firm", userId],
    enabled: !!userId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("firm_id")
        .eq("id", userId!)
        .maybeSingle();
      return (data as { firm_id: string | null } | null)?.firm_id ?? null;
    },
  });

export function useFirmId() {
  const { user } = useAuth();
  const q = useQuery(selfFirmQuery(user?.id));
  return q.data ?? null;
}

// ── Training Notes ────────────────────────────────────────────────────────────

export const trainingNoteQuery = (
  employeeId: string | undefined,
  key: { courseId?: string | null; spItemId?: string | null },
) =>
  queryOptions({
    queryKey: ["training-note", employeeId, key.courseId ?? null, key.spItemId ?? null],
    enabled: !!employeeId && !!(key.courseId || key.spItemId),
    queryFn: async () => {
      let q = supabase
        .from("training_notes" as never)
        .select("id, content, updated_at")
        .eq("employee_id", employeeId!);
      if (key.courseId) q = q.eq("course_id", key.courseId);
      else if (key.spItemId) q = q.eq("sharepoint_item_id", key.spItemId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as { id: string; content: unknown; updated_at: string } | null;
    },
  });

// ── News Feed ─────────────────────────────────────────────────────────────────

export type NewsPost = {
  id: string;
  firm_id: string;
  title: string;
  content: string | null;
  author_id: string;
  pinned: boolean;
  published_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

export const learningNewsQuery = (firmId: string | null | undefined) =>
  queryOptions({
    queryKey: ["learning-news", firmId],
    enabled: !!firmId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_news_posts" as never)
        .select(
          "id, firm_id, title, content, author_id, pinned, published_at, created_at, profiles(full_name, avatar_url)",
        )
        .eq("firm_id", firmId!)
        .not("published_at", "is", null)
        .order("pinned", { ascending: false })
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NewsPost[];
    },
  });

// All posts for management (includes unpublished drafts)
export const learningNewsAllQuery = (firmId: string | null | undefined) =>
  queryOptions({
    queryKey: ["learning-news-all", firmId],
    enabled: !!firmId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_news_posts" as never)
        .select(
          "id, firm_id, title, content, author_id, pinned, published_at, created_at, profiles(full_name, avatar_url)",
        )
        .eq("firm_id", firmId!)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NewsPost[];
    },
  });

// ── Q&A ───────────────────────────────────────────────────────────────────────

export type LearningQuestion = {
  id: string;
  firm_id: string;
  course_id: string | null;
  asker_id: string;
  title: string;
  body: string | null;
  is_resolved: boolean;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  learning_answers: { id: string }[];
};

export const learningQuestionsQuery = (
  firmId: string | null | undefined,
  filters: { courseId?: string | null; resolved?: boolean; search?: string },
) =>
  queryOptions({
    queryKey: ["learning-questions", firmId, filters],
    enabled: !!firmId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("learning_questions" as never)
        .select(
          "id, firm_id, course_id, asker_id, title, body, is_resolved, created_at, profiles(full_name, avatar_url), learning_answers(id)",
        )
        .eq("firm_id", firmId!)
        .order("is_resolved", { ascending: true })
        .order("created_at", { ascending: false });

      if (filters.courseId) q = q.eq("course_id", filters.courseId);
      if (filters.resolved !== undefined) q = q.eq("is_resolved", filters.resolved);
      if (filters.search) q = q.ilike("title", `%${filters.search}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LearningQuestion[];
    },
  });

export type LearningAnswer = {
  id: string;
  question_id: string;
  author_id: string;
  body: string;
  is_accepted: boolean;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

export const learningAnswersQuery = (questionId: string | undefined) =>
  queryOptions({
    queryKey: ["learning-answers", questionId],
    enabled: !!questionId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_answers" as never)
        .select(
          "id, question_id, author_id, body, is_accepted, created_at, profiles(full_name, avatar_url)",
        )
        .eq("question_id", questionId!)
        .order("is_accepted", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LearningAnswer[];
    },
  });

// ── Training Paths ────────────────────────────────────────────────────────────

export type TrainingPath = {
  id: string;
  firm_id: string;
  title: string;
  description: string | null;
  created_by: string;
  created_at: string;
};

export const trainingPathsQuery = (firmId: string | null | undefined) =>
  queryOptions({
    queryKey: ["training-paths", firmId],
    enabled: !!firmId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_paths" as never)
        .select("id, firm_id, title, description, created_by, created_at")
        .eq("firm_id", firmId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrainingPath[];
    },
  });

export type TrainingPathItem = {
  id: string;
  path_id: string;
  course_id: string;
  position: number;
  created_at: string;
  training_courses: {
    id: string;
    title: string;
    category: string;
    provider: string | null;
    duration_hours: number | null;
    cpe_credits: number | null;
  } | null;
};

export const trainingPathItemsQuery = (pathId: string | undefined) =>
  queryOptions({
    queryKey: ["training-path-items", pathId],
    enabled: !!pathId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_path_items" as never)
        .select(
          "id, path_id, course_id, position, created_at, training_courses(id, title, category, provider, duration_hours, cpe_credits)",
        )
        .eq("path_id", pathId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TrainingPathItem[];
    },
  });

export type TrainingPathAssignment = {
  id: string;
  path_id: string;
  employee_id: string;
  assigned_by: string;
  due_date: string | null;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

export const trainingPathAssignmentsQuery = (pathId: string | undefined) =>
  queryOptions({
    queryKey: ["training-path-assignments", pathId],
    enabled: !!pathId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_path_assignments" as never)
        .select(
          "id, path_id, employee_id, assigned_by, due_date, created_at, profiles!employee_id(full_name, avatar_url)",
        )
        .eq("path_id", pathId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TrainingPathAssignment[];
    },
  });

export const myPathAssignmentsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["my-path-assignments", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_path_assignments" as never)
        .select("id, path_id, due_date, created_at, training_paths(id, title, description)")
        .eq("employee_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        path_id: string;
        due_date: string | null;
        created_at: string;
        training_paths: { id: string; title: string; description: string | null } | null;
      }>;
    },
  });

// ── Leaderboard ───────────────────────────────────────────────────────────────

export type LeaderboardAssignmentRow = {
  employee_id: string;
  status: string;
  completed_at: string | null;
  training_courses: { cpe_credits: number | null } | null;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export const leaderboardAssignmentsQuery = (firmId: string | null | undefined) =>
  queryOptions({
    queryKey: ["learning-leaderboard-assignments", firmId],
    enabled: !!firmId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_assignments" as never)
        .select(
          "employee_id, status, completed_at, training_courses(cpe_credits), profiles!employee_id(id, full_name, avatar_url)",
        )
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeaderboardAssignmentRow[];
    },
  });

export const leaderboardPathsQuery = (firmId: string | null | undefined) =>
  queryOptions({
    queryKey: ["learning-leaderboard-paths", firmId],
    enabled: !!firmId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_path_assignments" as never)
        .select(
          "employee_id, path_id, training_paths!path_id(firm_id, training_path_items(course_id))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        employee_id: string;
        path_id: string;
        training_paths: {
          firm_id: string;
          training_path_items: { course_id: string }[];
        } | null;
      }>;
    },
  });
