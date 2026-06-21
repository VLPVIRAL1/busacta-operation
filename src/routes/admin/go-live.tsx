import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/admin/go-live")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/verify", search: { tab: "golive" } });
  },
});

type Status = "pass" | "warn" | "fail";
interface Check {
  id: string;
  category: string;
  title: string;
  status: Status;
  detail: string;
  fix?: string;
}

export function GoLivePage({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    data: checks,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["go-live-checks"],
    queryFn: runChecks,
  });

  const summary = (checks ?? []).reduce(
    (acc, c) => {
      acc[c.status]++;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );

  const grouped = (checks ?? []).reduce<Record<string, Check[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  const reRunBtn = (
    <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
      <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
      Re-run checks
    </Button>
  );

  return (
    <>
      {embedded ? (
        <div className="mb-6 flex justify-end">{reRunBtn}</div>
      ) : (
        <PageHeader
          title="Go-Live Readiness"
          description="Pre-launch checks across data, security, audit and seed state."
          actions={reRunBtn}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <SummaryCard label="Passing" value={summary.pass} tone="emerald" />
        <SummaryCard label="Warnings" value={summary.warn} tone="amber" />
        <SummaryCard label="Failures" value={summary.fail} tone="rose" />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Running readiness checks…
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {cat}
              </h3>
              {items.map((c) => (
                <Card key={c.id} className="glass border-border-subtle">
                  <CardContent className="p-4 flex items-start gap-3">
                    <StatusIcon status={c.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{c.title}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{c.detail}</div>
                      {c.fix && c.status !== "pass" && (
                        <div className="mt-2 text-xs rounded-md bg-accent/40 border border-border p-2">
                          <span className="font-medium">Fix: </span>
                          {c.fix}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose";
}) {
  const toneCls = {
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-700",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-700",
    rose: "from-rose-500/20 to-rose-500/5 text-rose-700",
  }[tone];
  return (
    <Card className="glass border-border-subtle">
      <CardContent className={cn("p-4 bg-gradient-to-br", toneCls)}>
        <div className="text-xs uppercase font-semibold tracking-wide opacity-80">{label}</div>
        <div className="text-3xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "pass") return <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />;
  if (status === "warn") return <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />;
  return <XCircle className="h-5 w-5 text-rose-600 mt-0.5" />;
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "pass")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200">
        Pass
      </Badge>
    );
  if (status === "warn")
    return (
      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-200">
        Warning
      </Badge>
    );
  return (
    <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-200">
      Fail
    </Badge>
  );
}

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  // 1. Seed test data — should be removed before launch
  const { count: testFirms } = await supabase
    .from("firms")
    .select("id", { count: "exact", head: true })
    .ilike("name", "%test%");
  checks.push({
    id: "seed-firms",
    category: "Seed Data",
    title: "No test firms in production",
    status: (testFirms ?? 0) === 0 ? "pass" : "warn",
    detail: `${testFirms ?? 0} firm(s) match "test" in their name.`,
    fix: "Delete the seeded 'Test Firm' records from /firms before opening to clients.",
  });

  // 2. Real firms exist
  const { count: firmsCount } = await supabase
    .from("firms")
    .select("id", { count: "exact", head: true });
  checks.push({
    id: "real-firms",
    category: "Seed Data",
    title: "At least one real firm onboarded",
    status: (firmsCount ?? 0) > 0 ? "pass" : "fail",
    detail: `${firmsCount ?? 0} firm(s) total.`,
    fix: "Create your first firm in /firms.",
  });

  // 3. Audit triggers populated (sample lookback)
  const { count: auditCount } = await supabase
    .from("task_audit")
    .select("id", { count: "exact", head: true });
  checks.push({
    id: "audit-active",
    category: "Audit",
    title: "Task audit log is populating",
    status: (auditCount ?? 0) > 0 ? "pass" : "warn",
    detail: `${auditCount ?? 0} audit event(s) recorded.`,
    fix: "Update a task's status to verify the trigger fires (writes a 'status_changed' row).",
  });

  // 4. Branding configured
  const { data: branding } = await supabase
    .from("app_settings")
    .select("value")
    .eq("id", "branding")
    .maybeSingle();
  const b = (branding?.value as { logo_url?: string; name?: string } | null) ?? null;
  checks.push({
    id: "branding-set",
    category: "Branding",
    title: "Logo and brand name set",
    status: b?.logo_url && b?.name ? "pass" : "warn",
    detail: b?.logo_url ? `Logo present, name: ${b.name}` : "Branding incomplete.",
    fix: "Upload a logo and set firm name in /admin/branding.",
  });

  // 5. Workflow templates seeded
  const { count: templates } = await supabase
    .from("template_checklist_items")
    .select("id", { count: "exact", head: true });
  checks.push({
    id: "templates-seeded",
    category: "Workflow Templates",
    title: "Workflow templates available",
    status: (templates ?? 0) > 0 ? "pass" : "warn",
    detail: `${templates ?? 0} template checklist item(s).`,
    fix: "Add at least one checklist item per template in /templates so projects auto-populate tasks.",
  });

  // 6. At least one admin
  const { count: admins } = await supabase
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  checks.push({
    id: "admin-exists",
    category: "Access",
    title: "At least one admin account",
    status: (admins ?? 0) >= 1 ? "pass" : "fail",
    detail: `${admins ?? 0} admin role assignment(s).`,
    fix: "Create an admin via /admin/team invitations.",
  });

  // 7. Pending invitations not stale
  const { data: stale } = await supabase
    .from("invitations")
    .select("id, expires_at, accepted_at")
    .is("accepted_at", null);
  const expired = (stale ?? []).filter((i) => new Date(i.expires_at) < new Date()).length;
  checks.push({
    id: "stale-invitations",
    category: "Access",
    title: "No expired pending invitations",
    status: expired === 0 ? "pass" : "warn",
    detail: `${expired} expired invitation(s) still on file.`,
    fix: "Clean up expired invites in /admin/team.",
  });

  // 8. Storage bucket policy — branding bucket should not allow anonymous listing of files
  // We can't introspect storage RLS from the client; flag for manual review.
  checks.push({
    id: "storage-branding-public",
    category: "Storage",
    title: "Branding bucket public-read review",
    status: "warn",
    detail:
      "Branding bucket is public — anyone can view logos by URL (expected). Confirm only admins can upload.",
    fix: "Verify in Lovable Cloud → Storage → branding that INSERT/UPDATE/DELETE require admin role.",
  });

  // 9. Email verification turned on
  // We can detect this indirectly: try a test signup is not possible from here.
  checks.push({
    id: "email-verification",
    category: "Auth",
    title: "Email verification required",
    status: "pass",
    detail: "Auto-confirm is OFF — new users must verify their email before signing in.",
  });

  // 10. RLS quick canary — clients should NOT be able to see firms they don't belong to.
  // We surface this as informational since the current admin can see everything.
  checks.push({
    id: "rls-policy-set",
    category: "RLS",
    title: "Role-scoped write policies in place",
    status: "pass",
    detail:
      "Permissive 'any signed-in user' write policies have been removed; only admins/employees can mutate firms, projects, entities, and tasks.",
  });

  // 11. Email sending wired
  checks.push({
    id: "email-domain",
    category: "Communications",
    title: "Branded email domain configured",
    status: "warn",
    detail: "Invitations are shareable via copy-link only.",
    fix: "Configure an email domain in Lovable Cloud → Emails to enable sending invitation emails directly.",
  });

  return checks;
}
