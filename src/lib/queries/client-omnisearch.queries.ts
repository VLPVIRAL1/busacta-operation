import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OmniFirmHit {
  kind: "firm";
  id: string;
  name: string;
  firm_identifier: string | null;
  status: string | null;
}

export interface OmniDirectHit {
  kind: "direct";
  id: string;
  display_name: string;
  identifier: string | null;
  status: string | null;
  client_type: string | null;
}

export type OmniHit = OmniFirmHit | OmniDirectHit;

const PER_STREAM_LIMIT = 6;

/**
 * Searches firms + direct_clients in parallel for the global ⌘K palette
 * "Clients" group. Searches BOTH name and identifier/code (per memory rule
 * that haystacks must include both).
 */
export const clientOmnisearchQuery = (term: string) =>
  queryOptions({
    queryKey: ["client-omnisearch", term],
    enabled: term.trim().length >= 1,
    staleTime: 15_000,
    queryFn: async (): Promise<{ firms: OmniFirmHit[]; direct: OmniDirectHit[] }> => {
      const t = term.trim();
      // Use ilike on name + identifier columns. PostgREST `or` lets us match either.
      const escape = (s: string) => s.replace(/[%_]/g, (m) => `\\${m}`);
      const pat = `%${escape(t)}%`;

      const [firmsRes, directRes] = await Promise.all([
        supabase
          .from("firms")
          .select("id, name, firm_identifier, status")
          .or(`name.ilike.${pat},firm_identifier.ilike.${pat}`)
          .neq("status", "deactivated")
          .order("name")
          .limit(PER_STREAM_LIMIT),
        supabase
          .from("direct_clients")
          .select("id, display_name, identifier, status, client_type")
          .or(`display_name.ilike.${pat},identifier.ilike.${pat}`)
          .order("display_name")
          .limit(PER_STREAM_LIMIT),
      ]);

      if (firmsRes.error) throw firmsRes.error;
      if (directRes.error) throw directRes.error;

      return {
        firms: (firmsRes.data ?? []).map((f) => ({ kind: "firm" as const, ...f })),
        direct: (directRes.data ?? []).map((d) => ({ kind: "direct" as const, ...d })),
      };
    },
  });
