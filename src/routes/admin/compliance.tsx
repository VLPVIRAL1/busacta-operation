import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Activity, Download, ShieldOff, ShieldCheck, Siren } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { supabase } from "@/integrations/supabase/client";
import {
  mfaCoverageQuery,
  complianceSensitiveQuery,
  complianceAuditQuery,
} from "@/lib/queries/admin.queries";
import { AdminGuide } from "@/components/admin/admin-guide";
import { AdminTabBar, ViewTab } from "@/components/admin/admin-tabs";
import { IncidentResponsePage } from "./incident-response";

type ComplianceTabKey = "posture" | "incident";
const COMPLIANCE_TABS: ComplianceTabKey[] = ["posture", "incident"];

export const Route = createFileRoute("/admin/compliance")({
  head: () => ({
    meta: [{ title: "Compliance | Admin" }],
  }),
  validateSearch: (s: Record<string, unknown>): { tab: ComplianceTabKey } => ({
    tab: COMPLIANCE_TABS.includes(s.tab as ComplianceTabKey)
      ? (s.tab as ComplianceTabKey)
      : "posture",
  }),
  component: () => (
    <AuthGuard allow={["admin", "super_admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin" }, { label: "Compliance" }]}>
        <ComplianceContainer />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function ComplianceContainer() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<ComplianceTabKey>(search.tab);

  const handleChange = (next: ComplianceTabKey) => {
    setTab(next);
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title="Compliance"
        description="SOC 2 Type 2 + HIPAA-defensive readiness evidence and incident response."
      />

      <AdminGuide pageName="compliance" className="mb-3 shrink-0">
        Your audit-readiness home. <strong>Posture</strong> shows MFA coverage, audit-log retention
        and access-review exports — the evidence auditors ask for. <strong>Incident Response</strong>{" "}
        logs security incidents and semi-annual tabletop drills (SOC&nbsp;2 CC7.4).
      </AdminGuide>

      <AdminTabBar>
        <ViewTab
          active={tab === "posture"}
          onClick={() => handleChange("posture")}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Posture"
        />
        <ViewTab
          active={tab === "incident"}
          onClick={() => handleChange("incident")}
          icon={<Siren className="h-3.5 w-3.5" />}
          label="Incident Response"
        />
      </AdminTabBar>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
        {tab === "posture" ? <ComplianceDashboard embedded /> : <IncidentResponsePage embedded />}
      </div>
    </div>
  );
}

type AuditRow = {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip: string | null;
};

type SensitiveRow = {
  id: string;
  occurred_at: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  ip: string | null;
};

export function ComplianceDashboard({ embedded = false }: { embedded?: boolean } = {}) {
  const [search, setSearch] = useState("");

  const mfa = useQuery(mfaCoverageQuery());
  const recentSensitive = useQuery(complianceSensitiveQuery(search));
  const recentAudit = useQuery(complianceAuditQuery(search));

  // MFA enforcement toggle (admin-controlled, temporary).
  const [mfaEnforced, setMfaEnforced] = useState<boolean | null>(null);
  const [mfaSaving, setMfaSaving] = useState(false);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("id", "security")
        .maybeSingle();
      const v = (data?.value as { mfa_enforcement_enabled?: boolean } | null)
        ?.mfa_enforcement_enabled;
      setMfaEnforced(v ?? true);
    })();
  }, []);
  const toggleMfaEnforcement = async (next: boolean) => {
    setMfaSaving(true);
    const prev = mfaEnforced;
    setMfaEnforced(next);
    const { data: cur } = await supabase
      .from("app_settings")
      .select("value")
      .eq("id", "security")
      .maybeSingle();
    const merged = {
      ...((cur?.value as Record<string, unknown>) ?? {}),
      mfa_enforcement_enabled: next,
    };
    const { error } = await supabase.from("app_settings").upsert({ id: "security", value: merged });
    setMfaSaving(false);
    if (error) {
      setMfaEnforced(prev);
      toast.error(`Could not update setting: ${error.message}`);
      return;
    }
    toast.success(next ? "MFA enforcement re-enabled" : "MFA enforcement disabled (temporary)");
  };

  const exportAccessReview = async () => {
    const [{ data: roles }, { data: profiles }, { data: caps }, { data: firms }] =
      await Promise.all([
        supabase.from("user_roles").select("user_id, role, created_at"),
        supabase.from("profiles").select("id, email, full_name, status, firm_id"),
        supabase
          .from("firm_member_capabilities")
          .select("firm_id, user_id, capability, allowed, updated_at"),
        supabase.from("firms").select("id, name"),
      ]);
    const profById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    const firmById = new Map((firms ?? []).map((f) => [f.id as string, f.name as string]));

    const rolesRows = [
      ["user_id", "email", "full_name", "role", "status", "firm_id", "granted_at"],
    ];
    for (const r of roles ?? []) {
      const p = profById.get(r.user_id as string);
      rolesRows.push([
        r.user_id as string,
        (p?.email as string) ?? "",
        (p?.full_name as string) ?? "",
        r.role as string,
        (p?.status as string) ?? "",
        (p?.firm_id as string) ?? "",
        r.created_at as string,
      ]);
    }

    const capRows = [
      [
        "firm_id",
        "firm_name",
        "user_id",
        "email",
        "full_name",
        "capability",
        "allowed",
        "updated_at",
      ],
    ];
    for (const c of caps ?? []) {
      const p = profById.get(c.user_id as string);
      capRows.push([
        c.firm_id as string,
        firmById.get(c.firm_id as string) ?? "",
        c.user_id as string,
        (p?.email as string) ?? "",
        (p?.full_name as string) ?? "",
        c.capability as string,
        String(c.allowed),
        c.updated_at as string,
      ]);
    }

    const toCsv = (rows: string[][]) =>
      rows
        .map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const stamp = format(new Date(), "yyyy-MM-dd");
    zip.file(`user-roles-${stamp}.csv`, toCsv(rolesRows));
    zip.file(`firm-member-capabilities-${stamp}.csv`, toCsv(capRows));
    zip.file(
      "README.txt",
      `Quarterly access review export — generated ${new Date().toISOString()}\n\n` +
        `Files:\n - user-roles-${stamp}.csv: every (user, role) grant with profile context.\n` +
        ` - firm-member-capabilities-${stamp}.csv: per-firm capability overrides.\n\n` +
        `Reviewer instructions: confirm each grant is still required; revoke unneeded grants in /admin/team.`,
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `access-review-${stamp}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportEvidencePack = async () => {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const [{ data: audit }, { data: sensitive }, { data: mfa }] = await Promise.all([
      supabase
        .from("audit_log" as never)
        .select("occurred_at, actor_id, actor_role, action, resource_type, resource_id, ip")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(5000),
      supabase
        .from("sensitive_action_log" as never)
        .select("occurred_at, actor_id, action, target_id, ip")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(5000),
      supabase.rpc("mfa_required_coverage" as never),
    ]);
    const toCsv = (rows: Array<Record<string, unknown>>) => {
      if (rows.length === 0) return "";
      const headers = Object.keys(rows[0]);
      return [
        headers.join(","),
        ...rows.map((r) =>
          headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","),
        ),
      ].join("\n");
    };
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const stamp = format(new Date(), "yyyy-MM-dd");
    zip.file(`audit-log-90d-${stamp}.csv`, toCsv((audit ?? []) as Array<Record<string, unknown>>));
    zip.file(
      `sensitive-actions-90d-${stamp}.csv`,
      toCsv((sensitive ?? []) as Array<Record<string, unknown>>),
    );
    zip.file(`mfa-coverage-${stamp}.json`, JSON.stringify(mfa ?? {}, null, 2));
    zip.file(
      "README.txt",
      `SOC 2 evidence pack — generated ${new Date().toISOString()}\n\n` +
        `Window: last 90 days.\n` +
        `Files:\n` +
        ` - audit-log-90d-${stamp}.csv: append-only audit_log slice.\n` +
        ` - sensitive-actions-90d-${stamp}.csv: privileged action timeline.\n` +
        ` - mfa-coverage-${stamp}.json: enrolled / required snapshot.\n\n` +
        `Hand to auditor alongside policy docs in /docs/compliance.`,
    );
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soc2-evidence-${stamp}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Compliance dashboard"
          description="SOC 2 Type 2 + HIPAA-defensive readiness evidence."
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> MFA-required roles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mfa.isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-semibold tabular-nums">
                  {mfa.data?.enrolled ?? 0}
                  <span className="text-base font-normal text-muted-foreground">
                    {" "}
                    / {mfa.data?.totalRequired ?? 0}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Users in MFA-required roles with a verified TOTP factor.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> Audit log retention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">7 years</div>
            <p className="text-xs text-muted-foreground mt-1">
              Append-only. Pruning gated to super_admin via <code>prune_audit_log()</code>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Download className="h-4 w-4" /> Quarterly access review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Download user roles + per-firm capability overrides for attestation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={exportAccessReview}>
                Access review ZIP
              </Button>
              <Button size="sm" variant="outline" onClick={exportEvidencePack}>
                SOC 2 evidence pack
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={mfaEnforced === false ? "border-amber-500/60 bg-amber-500/5" : undefined}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldOff className="h-4 w-4" /> MFA enforcement
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm">
              {mfaEnforced === null
                ? "Loading…"
                : mfaEnforced
                  ? "Currently enforced — users in MFA-required roles must enrol a verified factor."
                  : "Temporarily disabled — all users can sign in without MFA. Re-enable before launch."}
            </p>
            <p className="text-xs text-muted-foreground">
              Toggles are recorded in the audit log. This setting overrides per-role MFA
              requirements globally.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {mfaEnforced === false ? "Bypassed" : "Enforced"}
            </span>
            <Switch
              checked={mfaEnforced ?? true}
              disabled={mfaEnforced === null || mfaSaving}
              onCheckedChange={(v) => void toggleMfaEnforcement(v)}
              aria-label="Toggle MFA enforcement"
            />
          </div>
        </CardContent>
      </Card>

      <div>
        <Input
          placeholder="Filter by action or resource…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sensitive actions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSensitive.isLoading ? (
            <Skeleton className="h-32" />
          ) : (recentSensitive.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No sensitive actions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Actor</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2 pr-3">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentSensitive.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5 pr-3 tabular-nums">
                        {format(new Date(r.occurred_at), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="outline">{r.action}</Badge>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">
                        {r.actor_id?.slice(0, 8) ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{r.target_id ?? "—"}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{r.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log (latest 100)</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAudit.isLoading ? (
            <Skeleton className="h-48" />
          ) : (recentAudit.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Resource</th>
                    <th className="py-2 pr-3">Actor</th>
                    <th className="py-2 pr-3">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentAudit.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5 pr-3 tabular-nums">
                        {format(new Date(r.occurred_at), "yyyy-MM-dd HH:mm:ss")}
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="outline">{r.action}</Badge>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">
                        {r.resource_type}
                        {r.resource_id ? `:${r.resource_id.slice(0, 8)}` : ""}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">
                        {r.actor_id?.slice(0, 8) ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-xs">{r.actor_role ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
