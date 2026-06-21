import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DirectClientRow {
  id: string;
  display_name: string;
  legal_name: string | null;
  email: string;
  phone: string | null;
  client_type: "individual" | "business";
  identifier: string | null;
  status: string;
  owner_id: string | null;
  notes: string | null;
  provisioned_via: string;
  portal_user_id: string | null;
  created_at: string;
  updated_at: string;
  // Parity columns added in the firm/direct-client unification migration
  client_code: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  timezone: string | null;
  us_timezone: string | null;
  image_url: string | null;
  currency: string;
  esign_sender_name: string | null;
  esign_reply_to: string | null;
  accounting_software: string[];
  tax_software: string[];
  pm_software: string[];
  billing_email: string | null;
  deactivated_at: string | null;
  deactivated_by: string | null;
  deactivation_reason: string | null;
  feature_flags: Record<string, unknown>;
}

export interface DirectClientTaskTypeRow {
  id: string;
  code: string;
  label: string;
  default_pricing: number | null;
  active: boolean;
  sort_order: number;
}

export const directClientsListQuery = () =>
  queryOptions({
    queryKey: ["direct-clients", "list"],
    queryFn: async (): Promise<DirectClientRow[]> => {
      const { data, error } = await supabase
        .from("direct_clients")
        .select("*")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as DirectClientRow[];
    },
    staleTime: 30_000,
  });

export const directClientDetailQuery = (clientId: string) =>
  queryOptions({
    queryKey: ["direct-clients", "detail", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<DirectClientRow | null> => {
      const { data, error } = await supabase
        .from("direct_clients")
        .select("*")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data as DirectClientRow | null) ?? null;
    },
  });

export const directClientTasksQuery = (clientId: string) =>
  queryOptions({
    queryKey: ["direct-clients", "tasks", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id,title,status,priority,due_date,task_type_id,created_at,direct_client_task_types(label,code)",
        )
        .eq("direct_client_id", clientId)
        .eq("stream", "direct")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const directClientOrganizersQuery = (clientId: string) =>
  queryOptions({
    queryKey: ["direct-clients", "organizers", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizer_deployments")
        .select("id,status,due_at,submitted_at,template_id,organizer_templates(name)")
        .eq("target_type", "direct_client")
        .eq("target_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const directClientTaskTypesQuery = () =>
  queryOptions({
    queryKey: ["direct-client-task-types"],
    queryFn: async (): Promise<DirectClientTaskTypeRow[]> => {
      const { data, error } = await supabase
        .from("direct_client_task_types")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as DirectClientTaskTypeRow[];
    },
    staleTime: 5 * 60_000,
  });

export const organizerTemplatesForDispatchQuery = () =>
  queryOptions({
    queryKey: ["organizer-templates", "for-dispatch"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizer_templates")
        .select("id,name,purpose,status")
        .eq("status", "published")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
