/**
 * Saved views — persist a snapshot of inbox filters and restore later.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { toast } from "sonner";
import type { InboxKind, InboxScope } from "./communication.queries";

export interface SavedViewFilters {
  types?: InboxKind[];
  firmId?: string;
  firmIds?: string[];
  stage?: string;
  stages?: string[];
  assigneeId?: string;
  assigneeIds?: string[];
  reviewerId?: string;
  reviewerIds?: string[];
  view?: "active" | "archived";
  scope?: InboxScope;
  search?: string;
}

export interface SavedView {
  id: string;
  user_id: string;
  name: string;
  filters: SavedViewFilters;
  sort_order: number | null;
  created_at: string;
}

export function useSavedViews() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["saved-views", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<SavedView[]> => {
      const { data, error } = await supabase
        .from("saved_views")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SavedView[];
    },
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; filters: SavedViewFilters }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("saved_views").insert({
        user_id: user.id,
        name: input.name.trim(),
        filters: input.filters as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("View saved");
      qc.invalidateQueries({ queryKey: ["saved-views", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-views", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
