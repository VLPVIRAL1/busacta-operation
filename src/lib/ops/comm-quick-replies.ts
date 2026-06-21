/**
 * Quick replies (canned responses) — personal + firm-shared templates.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { toast } from "sonner";

export interface QuickReply {
  id: string;
  user_id: string;
  firm_id: string | null;
  label: string;
  body: string;
  scope_kind: string | null;
  created_at: string;
}

export function useQuickReplies() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["quick-replies", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<QuickReply[]> => {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("*")
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuickReply[];
    },
  });
}

export function useSaveQuickReply() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { label: string; body: string }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("quick_replies").insert({
        user_id: user.id,
        label: input.label.trim(),
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved quick reply");
      qc.invalidateQueries({ queryKey: ["quick-replies", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteQuickReply() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-replies", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
