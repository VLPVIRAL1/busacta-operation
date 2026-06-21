import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UnifiedStream = "cpa" | "direct";

export interface UnifiedClient {
  id: string;
  stream: UnifiedStream;
  name: string;
  code: string | null;
  status: string;
  contact: string | null;
  client_type?: string | null;
  pinned?: boolean;
  sort_index?: number;
}

/**
 * Merged list of B2B firms (B2B) + B2C clients (B2C) for the unified
 * `/clients` split-view. Reads per-user prefs (pin/sort_index) so the left
 * list can render pinned-on-top and respect manual order.
 */
export const unifiedClientsListQuery = () =>
  queryOptions({
    queryKey: ["unified-clients", "list"],
    staleTime: 30_000,
    queryFn: async (): Promise<UnifiedClient[]> => {
      const [firmsRes, directRes, prefsRes] = await Promise.all([
        supabase
          .from("firms")
          .select("id, name, firm_identifier, status, contact_email, city, state")
          .order("name"),
        supabase
          .from("direct_clients")
          .select("id, display_name, identifier, status, email, client_type")
          .order("display_name"),
        supabase.from("user_client_prefs").select("stream, client_id, pinned, sort_index"),
      ]);
      if (firmsRes.error) throw firmsRes.error;
      if (directRes.error) throw directRes.error;

      const prefMap = new Map<string, { pinned: boolean; sort_index: number }>();
      for (const p of prefsRes.data ?? []) {
        prefMap.set(`${p.stream}:${p.client_id}`, {
          pinned: !!p.pinned,
          sort_index: p.sort_index ?? 0,
        });
      }

      const firms: UnifiedClient[] = (firmsRes.data ?? []).map((f) => {
        const pref = prefMap.get(`cpa:${f.id}`);
        return {
          id: f.id,
          stream: "cpa",
          name: f.name,
          code: f.firm_identifier ?? null,
          status: f.status ?? "active",
          contact: f.contact_email ?? ([f.city, f.state].filter(Boolean).join(", ") || null),
          pinned: pref?.pinned ?? false,
          sort_index: pref?.sort_index ?? 0,
        };
      });
      const directs: UnifiedClient[] = (directRes.data ?? []).map((d) => {
        const pref = prefMap.get(`direct:${d.id}`);
        return {
          id: d.id,
          stream: "direct",
          name: d.display_name,
          code: d.identifier ?? d.id.slice(0, 4).toUpperCase(),
          status: d.status ?? "active",
          contact: d.email ?? null,
          client_type: d.client_type,
          pinned: pref?.pinned ?? false,
          sort_index: pref?.sort_index ?? 0,
        };
      });

      // Sort: pinned first, then manual sort_index (when present), then name
      const merged = [...firms, ...directs];
      const hasOrder = merged.some((c) => (c.sort_index ?? 0) > 0);
      return merged.sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        if (hasOrder) {
          const ai = a.sort_index ?? 0;
          const bi = b.sort_index ?? 0;
          if (ai !== bi) return ai - bi;
        }
        return a.name.localeCompare(b.name);
      });
    },
  });
