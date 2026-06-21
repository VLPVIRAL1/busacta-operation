import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { subscribeChannel } from "@/lib/realtime/channel-registry";
import { isHubVisibleFor, type HubVisibilityInputs } from "@/lib/auth/default-hubs-for-roles";
import type { ModuleKey } from "@/lib/routing/use-nav";

/**
 * Resolves whether the current user may see/enter each hub, enforcing the Hub
 * Module Visibility matrix independently of the global BYPASS_ACCESS role gate.
 *
 * Used by AppShell for direct-link route blocking and (via shared query keys)
 * by useNav for menu hiding. Subscribes to realtime changes on the current
 * user's `user_hub_permissions` rows so an admin toggle takes effect within
 * seconds without a reload.
 */
export function useHubAccess() {
  const { user, roles, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();

  // Shared key with useNav — React Query dedupes the fetch.
  const settingsQ = useQuery({
    queryKey: ["app-settings", "system", "nav"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("id", "system")
        .maybeSingle();
      return (data?.value ?? {}) as { module_hubs?: Partial<Record<ModuleKey, boolean>> };
    },
    staleTime: 60_000,
  });

  const overridesQ = useQuery({
    queryKey: ["user-hub-perms", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_hub_permissions" as never)
        .select("module_key,allowed")
        .eq("user_id", userId!);
      const map: Partial<Record<ModuleKey, boolean>> = {};
      for (const r of (data ?? []) as Array<{ module_key: string; allowed: boolean }>) {
        map[r.module_key as ModuleKey] = r.allowed;
      }
      return map;
    },
    staleTime: 60_000,
  });

  // Realtime: an admin toggling this user's hub access pushes a change that
  // invalidates the cached overrides, so enforcement applies live. Refcounted
  // so multiple mounts share a single subscription.
  useEffect(() => {
    if (!userId) return;
    return subscribeChannel(`hub-perms-${userId}`, (ch) =>
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_hub_permissions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["user-hub-perms", userId] });
        },
      ),
    );
  }, [userId, qc]);

  const inputs: HubVisibilityInputs = {
    overrides: overridesQ.data ?? {},
    roles: roles ?? [],
    moduleHubs: settingsQ.data?.module_hubs ?? {},
  };

  const isLoading = authLoading || settingsQ.isLoading || (!!userId && overridesQ.isLoading);

  return {
    isLoading,
    isHubVisible: (module: ModuleKey) => isHubVisibleFor(module, inputs),
  };
}
