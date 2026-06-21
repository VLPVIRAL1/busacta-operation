import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FirmRow = {
  id: string;
  name: string;
  contact_email: string | null;
  city: string | null;
  state: string | null;
  status: string;
  created_at: string;
};

export type FirmListItem = { id: string; name: string; status?: string };

export type ProjectGroupRow = {
  id: string;
  name: string;
  project_type: string | null;
  status: string | null;
  firm_id: string;
  firms: { id: string; name: string; status: string } | null;
};

export type MatrixMember = { id: string; user_id: string; role_label: string | null };
export type MatrixProfile = { id: string; full_name: string | null; email: string | null };
export type MatrixCapability = {
  user_id: string;
  capability: string;
  allowed: boolean;
  firm_id: string;
};

export const firmHubFirmsQuery = () =>
  queryOptions({
    queryKey: ["firm-hub-firms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firms")
        .select("id, name, contact_email, city, state, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FirmRow[];
    },
  });

export const firmHubProjectsGroupedQuery = () =>
  queryOptions({
    queryKey: ["firm-hub-projects-grouped"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, project_type, status, firm_id, firms:firm_id(id, name, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectGroupRow[];
    },
  });

export const matrixFirmsQuery = () =>
  queryOptions({
    queryKey: ["matrix-firms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firms")
        .select("id, name")
        .neq("status", "deactivated")
        .order("name");
      if (error) throw error;
      return (data ?? []) as FirmListItem[];
    },
  });

export const matrixMembersQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["matrix-members", firmId],
    enabled: !!firmId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_internal_team")
        .select("id, user_id, role_label")
        .eq("firm_id", firmId);
      if (error) throw error;
      return (data ?? []) as MatrixMember[];
    },
  });

export const matrixProfilesQuery = (userIds: string[]) =>
  queryOptions({
    queryKey: ["matrix-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      if (error) throw error;
      return (data ?? []) as MatrixProfile[];
    },
  });

export const matrixCapabilitiesQuery = (firmId: string) =>
  queryOptions({
    queryKey: ["matrix-caps", firmId],
    enabled: !!firmId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_member_capabilities")
        .select("*")
        .eq("firm_id", firmId);
      if (error) throw error;
      return (data ?? []) as MatrixCapability[];
    },
  });
