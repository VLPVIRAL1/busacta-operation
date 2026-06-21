import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  matrixFirmsQuery,
  matrixMembersQuery,
  matrixProfilesQuery,
  matrixCapabilitiesQuery,
} from "@/lib/queries/firm-hub.queries";

export const Route = createFileRoute("/clients/firm/matrix")({
  component: () => (
    <AuthGuard allow={["super_admin"]}>
      <AppShell
        crumbs={[
          { label: "Admin" },
          { label: "B2B Firm Hub", to: "/clients" },
          { label: "Team Access Matrix" },
        ]}
      >
        <PageHeader
          title="Team Access Matrix"
          description="Toggle every team member's capability for a selected firm."
        />
        <TeamAccessMatrix />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

const CAPABILITIES: Array<{ key: string; label: string }> = [
  { key: "view_pipeline", label: "View pipeline" },
  { key: "edit_tasks", label: "Create / edit tasks" },
  { key: "manage_clients", label: "Manage client entities" },
  { key: "post_messages", label: "Post messages" },
  { key: "view_invoices", label: "View invoices" },
  { key: "manage_sops", label: "Manage SOPs" },
];

function TeamAccessMatrix() {
  const qc = useQueryClient();
  const [firmFilter, setFirmFilter] = useState<string>("");

  const { data: firms = [] } = useQuery(matrixFirmsQuery());

  const activeFirm = firmFilter || firms[0]?.id || "";

  const { data: members = [], isLoading: lm } = useQuery(matrixMembersQuery(activeFirm));

  const userIds = members.map((m) => m.user_id);
  const { data: profiles = [] } = useQuery(matrixProfilesQuery(userIds));
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const { data: caps = [] } = useQuery(matrixCapabilitiesQuery(activeFirm));
  const capMap = useMemo(() => {
    const m = new Map<string, boolean>();
    caps.forEach((c) => m.set(`${c.user_id}:${c.capability}`, c.allowed));
    return m;
  }, [caps]);

  const setCap = useMutation({
    mutationFn: async ({
      user_id,
      capability,
      allowed,
    }: {
      user_id: string;
      capability: string;
      allowed: boolean;
    }) => {
      const { error } = await supabase
        .from("firm_member_capabilities")
        .upsert(
          { firm_id: activeFirm, user_id, capability, allowed },
          { onConflict: "firm_id,user_id,capability" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matrix-caps", activeFirm] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
        <div>
          <CardTitle>Team Access Matrix</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Select a firm to manage capabilities across its team.
          </p>
        </div>
        <div className="min-w-[260px]">
          <Label className="text-xs">Filter by client / firm</Label>
          <Select value={activeFirm} onValueChange={setFirmFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Select firm…" />
            </SelectTrigger>
            <SelectContent>
              {(firms as any[]).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {!activeFirm ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Pick a firm to view its access matrix.
          </div>
        ) : lm ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : members.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No team members assigned.{" "}
            <Link
              to="/clients/firm/$firmId"
              params={{ firmId: activeFirm }}
              className="text-primary underline"
            >
              Open firm to assign
            </Link>
            .
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left">
                  <th className="sticky left-0 bg-background px-3 py-2 border-b">Member</th>
                  {CAPABILITIES.map((c) => (
                    <th key={c.key} className="px-3 py-2 border-b text-center font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(members as any[]).map((m) => {
                  const p = profileMap.get(m.user_id);
                  return (
                    <tr key={m.id} className="hover:bg-muted/40">
                      <td className="sticky left-0 bg-background px-3 py-2 border-b">
                        <div className="font-medium">{p?.full_name ?? p?.email ?? m.user_id}</div>
                        <div className="text-xs text-muted-foreground">{m.role_label ?? "—"}</div>
                      </td>
                      {CAPABILITIES.map((c) => {
                        const allowed = capMap.has(`${m.user_id}:${c.key}`)
                          ? capMap.get(`${m.user_id}:${c.key}`)!
                          : true;
                        return (
                          <td key={c.key} className="px-3 py-2 border-b text-center">
                            <Switch
                              checked={allowed}
                              onCheckedChange={(v) =>
                                setCap.mutate({ user_id: m.user_id, capability: c.key, allowed: v })
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
