import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Search, LayoutGrid, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { supabase } from "@/integrations/supabase/client";
import {
  hubPermsProfilesQuery,
  moduleHubsSettingsQuery,
  hubPermsRowsQuery,
  type HubPermProfileRow as ProfileRow,
  type HubPermRow as PermRow,
} from "@/lib/queries/admin.queries";
import { useAuth } from "@/lib/auth/auth-context";
import { TOGGLEABLE_MODULES, MODULE_LABEL, type ModuleKey } from "@/lib/routing/use-nav";
import { defaultHubsForRoles } from "@/lib/auth/default-hubs-for-roles";

export const Route = createFileRoute("/admin/hub-permissions")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/access-control", search: { tab: "roles" } });
  },
  component: () => null,
  errorComponent: RouteErrorComponent,
});

type Cell = boolean | "inherit"; // inherit = use global

export function HubPermissionsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Record<string, Partial<Record<ModuleKey, Cell>>>>({});

  const profilesQ = useQuery(hubPermsProfilesQuery());
  const settingsQ = useQuery(moduleHubsSettingsQuery());
  const permsQ = useQuery(hubPermsRowsQuery());
  const rolesQ = useQuery({
    queryKey: ["hub-perms", "user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; role: string }>;
    },
  });
  const rolesByUser = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rolesQ.data ?? []) {
      const arr = m.get(r.user_id) ?? [];
      arr.push(r.role);
      m.set(r.user_id, arr);
    }
    return m;
  }, [rolesQ.data]);

  const permMap = useMemo(() => {
    const m = new Map<string, Map<string, boolean>>();
    for (const r of permsQ.data ?? []) {
      if (!m.has(r.user_id)) m.set(r.user_id, new Map());
      m.get(r.user_id)!.set(r.module_key, r.allowed);
    }
    return m;
  }, [permsQ.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (profilesQ.data ?? []).filter((p) => {
      if (!term) return true;
      return (
        (p.full_name ?? "").toLowerCase().includes(term) ||
        (p.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [profilesQ.data, q]);

  const cellValue = (uid: string, mk: ModuleKey): Cell => {
    const d = draft[uid]?.[mk];
    if (d !== undefined) return d;
    const v = permMap.get(uid)?.get(mk);
    return v === undefined ? "inherit" : v;
  };

  const setCell = (uid: string, mk: ModuleKey, v: Cell) => {
    setDraft((d) => ({ ...d, [uid]: { ...(d[uid] ?? {}), [mk]: v } }));
  };

  const cycle = (uid: string, mk: ModuleKey) => {
    const cur = cellValue(uid, mk);
    setCell(uid, mk, cur === "inherit" ? true : cur === true ? false : "inherit");
  };

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const uid of Object.keys(draft)) {
      for (const mk of Object.keys(draft[uid]) as ModuleKey[]) {
        const next = draft[uid][mk]!;
        const cur = permMap.get(uid)?.get(mk);
        const curCell: Cell = cur === undefined ? "inherit" : cur;
        if (next !== curCell) n += 1;
      }
    }
    return n;
  }, [draft, permMap]);

  const save = useMutation({
    mutationFn: async () => {
      const upserts: {
        user_id: string;
        module_key: string;
        allowed: boolean;
        updated_by: string | null;
      }[] = [];
      const deletes: { user_id: string; module_key: string }[] = [];
      for (const uid of Object.keys(draft)) {
        for (const mk of Object.keys(draft[uid]) as ModuleKey[]) {
          const v = draft[uid][mk]!;
          if (v === "inherit") deletes.push({ user_id: uid, module_key: mk });
          else
            upserts.push({
              user_id: uid,
              module_key: mk,
              allowed: v,
              updated_by: user?.id ?? null,
            });
        }
      }
      if (upserts.length > 0) {
        const { error } = await supabase
          .from("user_hub_permissions" as never)
          .upsert(upserts as never, { onConflict: "user_id,module_key" });
        if (error) throw error;
      }
      for (const d of deletes) {
        const { error } = await supabase
          .from("user_hub_permissions" as never)
          .delete()
          .eq("user_id", d.user_id)
          .eq("module_key", d.module_key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Hub permissions saved");
      setDraft({});
      qc.invalidateQueries({ queryKey: ["hub-perms"] });
      qc.invalidateQueries({ queryKey: ["user-hub-perms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const globalLabel = (mk: ModuleKey) => (settingsQ.data?.[mk] === false ? "Off" : "On");

  const isLoading =
    profilesQ.isLoading || permsQ.isLoading || settingsQ.isLoading || rolesQ.isLoading;

  return (
    <>
      {embedded ? (
        <div className="mb-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/settings">
              <LayoutGrid className="h-4 w-4" /> Global settings
            </Link>
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={dirtyCount === 0 || save.isPending}
          >
            <Save className="h-4 w-4" />{" "}
            {save.isPending ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </Button>
        </div>
      ) : (
        <PageHeader
          title="Hub permissions matrix"
          description="Override the global hub visibility per employee. Cells default to Inherit (use the global setting from System Preferences)."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/settings">
                  <LayoutGrid className="h-4 w-4" /> Global settings
                </Link>
              </Button>
              <Button
                size="sm"
                onClick={() => save.mutate()}
                disabled={dirtyCount === 0 || save.isPending}
              >
                <Save className="h-4 w-4" />{" "}
                {save.isPending ? "Saving…" : `Save${dirtyCount ? ` (${dirtyCount})` : ""}`}
              </Button>
            </div>
          }
        />
      )}

      <Card className="mb-3">
        <CardContent className="flex items-center gap-3 p-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search employees…"
              className="pl-8"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Click a cell to cycle:{" "}
            <Badge variant="outline" className="mx-1">
              Inherit
            </Badge>
            <Badge variant="default" className="mx-1">
              Show
            </Badge>
            <Badge variant="destructive" className="mx-1">
              Hide
            </Badge>
          </div>
          {dirtyCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setDraft({})}>
              <RotateCcw className="h-3.5 w-3.5" /> Discard
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-auto max-h-[70vh]">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/60 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/60 z-20">
                    Employee
                  </th>
                  {TOGGLEABLE_MODULES.map((m) => (
                    <th key={m} className="px-2 py-2 font-medium text-center min-w-[110px]">
                      <div>{MODULE_LABEL[m]}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        global: {globalLabel(m)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 sticky left-0 bg-card">
                      <div className="font-medium truncate max-w-[260px]">
                        {p.full_name ?? p.email ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                        {p.email}
                      </div>
                    </td>
                    {TOGGLEABLE_MODULES.map((m) => {
                      const v = cellValue(p.id, m);
                      const roleDefault =
                        v === "inherit"
                          ? defaultHubsForRoles(rolesByUser.get(p.id) ?? []).has(m)
                          : null;
                      const tone = v === true ? "default" : v === false ? "destructive" : "outline";
                      const label =
                        v === true
                          ? "Show"
                          : v === false
                            ? "Hide"
                            : roleDefault === true
                              ? "Show (role)"
                              : roleDefault === false
                                ? "Hide (role)"
                                : "Inherit";
                      return (
                        <td key={m} className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => cycle(p.id, m)}
                            className="inline-flex"
                            title={
                              v === "inherit"
                                ? `Inherits from role default (${roleDefault ? "Show" : "Hide"}). Click to override.`
                                : "Click to cycle Inherit → Show → Hide"
                            }
                          >
                            <Badge
                              variant={tone}
                              className={
                                "cursor-pointer min-w-[60px] justify-center" +
                                (v === "inherit" ? " opacity-70" : "")
                              }
                            >
                              {label}
                            </Badge>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={TOGGLEABLE_MODULES.length + 1}
                      className="p-6 text-center text-muted-foreground"
                    >
                      No employees match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
