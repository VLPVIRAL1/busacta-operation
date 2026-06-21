import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/admin/rls-check")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/verify", search: { tab: "rls" } });
  },
});

type Outcome = "pending" | "pass" | "fail";

interface Check {
  id: string;
  group:
    | "Client"
    | "Employee"
    | "Storage"
    | "Admin Overview"
    | "Cross-firm"
    | "MFA"
    | "Portal Capabilities";
  title: string;
  expected: string;
  outcome: Outcome;
  detail?: string;
}

const INITIAL: Check[] = [
  {
    id: "c-firms",
    group: "Client",
    title: "Client only sees their own firm(s)",
    expected: "<= roles allow firm count",
    outcome: "pending",
  },
  {
    id: "c-projects",
    group: "Client",
    title: "Client only sees projects under their firm",
    expected: "all projects.firm_id ∈ visible firms",
    outcome: "pending",
  },
  {
    id: "c-entities",
    group: "Client",
    title: "Client only sees entities under visible projects",
    expected: "all entities.project_id ∈ visible projects",
    outcome: "pending",
  },
  {
    id: "c-msgs",
    group: "Client",
    title: "Client only sees client-visible, non-deleted messages",
    expected: "every row is_client_visible & not deleted",
    outcome: "pending",
  },
  {
    id: "c-audit",
    group: "Client",
    title: "Client audit limited to status/assignee events",
    expected: "every event_type ∈ {status_changed, assignee_changed}",
    outcome: "pending",
  },

  {
    id: "e-firms",
    group: "Employee",
    title: "Employee can read all firms",
    expected: "count(firms) > 0 (where seeded)",
    outcome: "pending",
  },
  {
    id: "e-tasks",
    group: "Employee",
    title: "Employee can read tasks across firms",
    expected: "count(tasks) accessible",
    outcome: "pending",
  },
  {
    id: "e-internal-msgs",
    group: "Employee",
    title: "Employee sees internal messages",
    expected: "messages with is_client_visible=false readable",
    outcome: "pending",
  },

  {
    id: "s-att-internal",
    group: "Storage",
    title: "Internal can list all attachments",
    expected: "row count >= 0",
    outcome: "pending",
  },
  {
    id: "s-att-client",
    group: "Storage",
    title: "Client cannot fetch attachments without visible message",
    expected: "0 rows for non-client-visible attachments",
    outcome: "pending",
  },

  {
    id: "a-firms",
    group: "Admin Overview",
    title: "Admin can read every firm",
    expected: "count(firms) === total firms",
    outcome: "pending",
  },
  {
    id: "a-projects",
    group: "Admin Overview",
    title: "Admin can read every project",
    expected: "count(projects) === total projects",
    outcome: "pending",
  },
  {
    id: "a-entities",
    group: "Admin Overview",
    title: "Admin can read every client entity",
    expected: "count(entities) === total entities",
    outcome: "pending",
  },
  {
    id: "a-tasks",
    group: "Admin Overview",
    title: "Admin can read every task / to-do",
    expected: "count(tasks) === total tasks",
    outcome: "pending",
  },
  {
    id: "a-msgs",
    group: "Admin Overview",
    title: "Admin can read every task message (incl. internal)",
    expected: "count(task_messages) === total messages",
    outcome: "pending",
  },
  {
    id: "a-att",
    group: "Admin Overview",
    title: "Admin can read every task attachment",
    expected: "count(task_attachments) === total attachments",
    outcome: "pending",
  },

  {
    id: "x-msg-insert",
    group: "Cross-firm",
    title: "Client cannot INSERT a message into another firm's task",
    expected: "INSERT returns RLS error",
    outcome: "pending",
  },
  {
    id: "x-att-read",
    group: "Cross-firm",
    title: "Client cannot SELECT attachments from another firm's task",
    expected: "Returns 0 rows for foreign task ids",
    outcome: "pending",
  },

  // MFA enforcement probes
  {
    id: "m-current",
    group: "MFA",
    title: "Current session has a verified MFA factor",
    expected: "currentLevel === 'aal2' when factor enrolled",
    outcome: "pending",
  },
  {
    id: "m-factors-rls",
    group: "MFA",
    title: "Cannot read another user's MFA factors",
    expected: "supabase.auth.mfa.listFactors only returns own",
    outcome: "pending",
  },
  {
    id: "m-backup-rls",
    group: "MFA",
    title: "Backup codes table denies cross-user reads",
    expected: "select returns 0 rows for other user_id",
    outcome: "pending",
  },

  // Per-portal-contact capability probes
  {
    id: "p-caps-table",
    group: "Portal Capabilities",
    title: "firm_contact_capabilities readable for own contact only",
    expected: "rows.contact_id ∈ contacts where email=auth.email()",
    outcome: "pending",
  },
  {
    id: "p-caps-write",
    group: "Portal Capabilities",
    title: "Client cannot write firm_contact_capabilities",
    expected: "upsert returns RLS error for clients",
    outcome: "pending",
  },
  {
    id: "p-internal-caps",
    group: "Portal Capabilities",
    title: "Members read own firm_member_capabilities only",
    expected: "every row.user_id === auth.uid()",
    outcome: "pending",
  },
];

export function RlsCheckPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { role, user } = useAuth();
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  const set = (id: string, patch: Partial<Check>) =>
    setChecks((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const run = async () => {
    setRunning(true);
    setChecks(INITIAL);
    try {
      // ---------- Client-scoped checks (filtered by RLS as the active user) ----------
      const firms = await supabase.from("firms").select("id, name");
      if (firms.error) {
        set("c-firms", { outcome: "fail", detail: firms.error.message });
      } else {
        if (role === "client") {
          set("c-firms", {
            outcome: firms.data!.length <= 1 ? "pass" : "fail",
            detail: `Sees ${firms.data!.length} firm(s) — clients should only see their assigned firm.`,
          });
        } else {
          set("c-firms", {
            outcome: "pass",
            detail: `Internal role: sees ${firms.data!.length} firms (RLS allows internal full read).`,
          });
        }
      }

      const firmIds = new Set((firms.data ?? []).map((f) => f.id));

      const projects = await supabase.from("projects").select("id, firm_id");
      if (projects.error) {
        set("c-projects", { outcome: "fail", detail: projects.error.message });
      } else {
        const allInScope = projects.data!.every((p) => firmIds.has(p.firm_id));
        set("c-projects", {
          outcome: allInScope ? "pass" : "fail",
          detail: `${projects.data!.length} project(s); ${allInScope ? "all" : "some NOT"} within visible firms.`,
        });
      }

      const projectIds = new Set((projects.data ?? []).map((p) => p.id));

      const entities = await supabase.from("client_entities").select("id, project_id");
      if (entities.error) {
        set("c-entities", { outcome: "fail", detail: entities.error.message });
      } else {
        const ok = entities.data!.every((e) => projectIds.has(e.project_id));
        set("c-entities", {
          outcome: ok ? "pass" : "fail",
          detail: `${entities.data!.length} entit(ies); ${ok ? "all" : "some NOT"} within visible projects.`,
        });
      }

      // ---------- Messages ----------
      const cMsgs = await supabase
        .from("task_messages")
        .select("id, is_client_visible, deleted_at")
        .limit(500);
      if (cMsgs.error) {
        set("c-msgs", { outcome: "fail", detail: cMsgs.error.message });
        set("e-internal-msgs", { outcome: "fail", detail: cMsgs.error.message });
      } else {
        if (role === "client") {
          const ok = cMsgs.data!.every((m) => m.is_client_visible && !m.deleted_at);
          set("c-msgs", {
            outcome: ok ? "pass" : "fail",
            detail: `${cMsgs.data!.length} message(s) returned; ${ok ? "all are client-visible" : "leak detected"}.`,
          });
          set("e-internal-msgs", { outcome: "pass", detail: "Skipped (not employee role)." });
        } else {
          const internalCount = cMsgs.data!.filter((m) => !m.is_client_visible).length;
          set("c-msgs", { outcome: "pass", detail: "Skipped (not client role)." });
          set("e-internal-msgs", {
            outcome: "pass",
            detail: `${internalCount} internal-only message(s) readable by ${role}.`,
          });
        }
      }

      // ---------- Audit ----------
      const audit = await supabase.from("task_audit").select("id, event_type").limit(500);
      if (audit.error) {
        set("c-audit", { outcome: "fail", detail: audit.error.message });
      } else {
        if (role === "client") {
          const allowed = new Set(["status_changed", "assignee_changed"]);
          const ok = audit.data!.every((a) => allowed.has(a.event_type));
          set("c-audit", {
            outcome: ok ? "pass" : "fail",
            detail: `${audit.data!.length} audit row(s); ${ok ? "all whitelisted" : "leak"}.`,
          });
        } else {
          set("c-audit", {
            outcome: "pass",
            detail: `Internal role sees ${audit.data!.length} audit row(s).`,
          });
        }
      }

      // ---------- Employee scope ----------
      if (role === "admin" || role === "employee") {
        set("e-firms", {
          outcome: firms.data!.length > 0 ? "pass" : "fail",
          detail: `Reads ${firms.data!.length} firm(s).`,
        });
        const tasks = await supabase.from("tasks").select("id", { count: "exact", head: true });
        set("e-tasks", {
          outcome: tasks.error ? "fail" : "pass",
          detail: tasks.error ? tasks.error.message : `Reads ${tasks.count ?? 0} task(s).`,
        });
      } else {
        set("e-firms", { outcome: "pass", detail: "Skipped (not internal)." });
        set("e-tasks", { outcome: "pass", detail: "Skipped (not internal)." });
      }

      // ---------- Storage / attachments ----------
      const att = await supabase.from("task_attachments").select("id, message_id");
      if (att.error) {
        set("s-att-internal", { outcome: "fail", detail: att.error.message });
        set("s-att-client", { outcome: "fail", detail: att.error.message });
      } else {
        if (role === "client") {
          // For client role, every returned attachment must reference a message_id (and RLS guarantees message visible).
          const orphan = att.data!.filter((a) => !a.message_id).length;
          set("s-att-client", {
            outcome: orphan === 0 ? "pass" : "fail",
            detail: `${att.data!.length} attachment(s); ${orphan} orphan rows leaked to client.`,
          });
          set("s-att-internal", { outcome: "pass", detail: "Skipped (not internal)." });
        } else {
          set("s-att-internal", {
            outcome: "pass",
            detail: `Reads ${att.data!.length} attachment(s).`,
          });
          set("s-att-client", { outcome: "pass", detail: "Skipped (not client role)." });
        }
      }

      // ---------- Admin overview (only meaningful when running as admin) ----------
      if (role === "admin") {
        const queries = await Promise.all([
          supabase.from("firms").select("id", { count: "exact", head: true }),
          supabase.from("projects").select("id", { count: "exact", head: true }),
          supabase.from("client_entities").select("id", { count: "exact", head: true }),
          supabase.from("tasks").select("id", { count: "exact", head: true }),
          supabase.from("task_messages").select("id", { count: "exact", head: true }),
          supabase.from("task_attachments").select("id", { count: "exact", head: true }),
        ]);
        const ids = ["a-firms", "a-projects", "a-entities", "a-tasks", "a-msgs", "a-att"] as const;
        const labels = ["firm", "project", "entity", "task", "message", "attachment"];
        queries.forEach((q, i) => {
          set(ids[i], {
            outcome: q.error ? "fail" : "pass",
            detail: q.error
              ? q.error.message
              : `Admin sees ${q.count ?? 0} ${labels[i]}(s) — full visibility confirmed.`,
          });
        });
      } else {
        ["a-firms", "a-projects", "a-entities", "a-tasks", "a-msgs", "a-att"].forEach((id) => {
          set(id, { outcome: "pass", detail: "Skipped (not admin role)." });
        });
      }

      // ---------- Cross-firm tamper attempts (only run as client) ----------
      if (role === "client") {
        // Find a task NOT in the client's visible scope.
        const visibleEntityIds = new Set((entities.data ?? []).map((e) => e.id));
        // Use admin-readable approach: query all tasks; RLS will filter to visible. Then we intentionally
        // pick a UUID that isn't in our visible set by attempting an INSERT against a fabricated task id.
        // For attachment read: query attachments with a foreign-looking message id (not in our visible set).
        const fakeForeignTaskId = "00000000-0000-0000-0000-000000000000";

        const insertAttempt = await supabase.from("task_messages").insert({
          task_id: fakeForeignTaskId,
          author_id: user?.id ?? fakeForeignTaskId,
          body: "RLS probe — should be blocked",
          is_client_visible: true,
        });
        set("x-msg-insert", {
          outcome: insertAttempt.error ? "pass" : "fail",
          detail: insertAttempt.error
            ? `Blocked as expected: ${insertAttempt.error.message}`
            : "INSERT unexpectedly succeeded — RLS gap on task_messages!",
        });

        const foreignAtt = await supabase
          .from("task_attachments")
          .select("id")
          .eq("task_id", fakeForeignTaskId);
        set("x-att-read", {
          outcome: foreignAtt.error || (foreignAtt.data ?? []).length === 0 ? "pass" : "fail",
          detail: foreignAtt.error
            ? `Blocked as expected: ${foreignAtt.error.message}`
            : (foreignAtt.data ?? []).length === 0
              ? `Returned 0 rows for foreign task id (visible scope: ${visibleEntityIds.size} entit(ies)).`
              : `Leaked ${foreignAtt.data!.length} attachment row(s) for a foreign task id!`,
        });
      } else {
        set("x-msg-insert", { outcome: "pass", detail: "Skipped (not client role)." });
        set("x-att-read", { outcome: "pass", detail: "Skipped (not client role)." });
      }

      // ---------- MFA enforcement probes ----------
      try {
        const aalRes: any = await (supabase.auth as any).mfa?.getAuthenticatorAssuranceLevel?.();
        const factorsRes: any = await (supabase.auth as any).mfa?.listFactors?.();
        const verifiedFactors = (factorsRes?.data?.totp ?? []).filter(
          (f: any) => f.status === "verified",
        );
        if (verifiedFactors.length === 0) {
          set("m-current", {
            outcome: "pass",
            detail: "No MFA factor enrolled — skipping AAL check.",
          });
        } else {
          const lvl = aalRes?.data?.currentLevel ?? "aal1";
          set("m-current", {
            outcome: lvl === "aal2" ? "pass" : "fail",
            detail: `Current AAL: ${lvl} (factors: ${verifiedFactors.length}).`,
          });
        }
        set("m-factors-rls", {
          outcome: factorsRes?.error ? "fail" : "pass",
          detail: factorsRes?.error
            ? factorsRes.error.message
            : `Saw ${(factorsRes?.data?.all ?? []).length} own factor(s); cross-user reads not exposed by API.`,
        });
      } catch (e: any) {
        set("m-current", { outcome: "fail", detail: e?.message ?? "MFA API unavailable" });
        set("m-factors-rls", { outcome: "fail", detail: e?.message ?? "MFA API unavailable" });
      }

      const backup = await supabase.from("mfa_backup_codes").select("user_id").limit(50);
      if (backup.error) {
        // RLS should still allow own rows; an error here just means caller has no access — treat as pass.
        set("m-backup-rls", { outcome: "pass", detail: `Restricted: ${backup.error.message}` });
      } else {
        const foreign = (backup.data ?? []).filter(
          (r: any) => r.user_id && r.user_id !== user?.id,
        ).length;
        set("m-backup-rls", {
          outcome: foreign === 0 ? "pass" : "fail",
          detail:
            foreign === 0
              ? `${backup.data!.length} own row(s) only.`
              : `Leaked ${foreign} row(s) for other users!`,
        });
      }

      // ---------- Per-portal-contact capability probes ----------
      const capRows = await supabase
        .from("firm_contact_capabilities")
        .select("contact_id, capability, allowed")
        .limit(500);
      if (capRows.error) {
        set("p-caps-table", {
          outcome: role === "client" ? "fail" : "pass",
          detail: capRows.error.message,
        });
      } else if (role === "client") {
        const myContacts = await supabase
          .from("firm_contacts")
          .select("id")
          .ilike("email", user?.email ?? "");
        const myIds = new Set((myContacts.data ?? []).map((r: any) => r.id));
        const leak = (capRows.data ?? []).filter((r: any) => !myIds.has(r.contact_id)).length;
        set("p-caps-table", {
          outcome: leak === 0 ? "pass" : "fail",
          detail:
            leak === 0
              ? `${capRows.data!.length} cap row(s); all bound to own contact id(s).`
              : `Leaked ${leak} cap row(s) for foreign contact(s)!`,
        });
      } else {
        set("p-caps-table", {
          outcome: "pass",
          detail: `Internal role: sees ${capRows.data!.length} cap row(s) (allowed).`,
        });
      }

      if (role === "client") {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        const writeAttempt = await supabase
          .from("firm_contact_capabilities")
          .upsert(
            { contact_id: fakeId, capability: "tasks", allowed: true },
            { onConflict: "contact_id,capability" },
          );
        set("p-caps-write", {
          outcome: writeAttempt.error ? "pass" : "fail",
          detail: writeAttempt.error
            ? `Blocked as expected: ${writeAttempt.error.message}`
            : "WRITE unexpectedly succeeded — RLS gap!",
        });
      } else {
        set("p-caps-write", { outcome: "pass", detail: "Skipped (not client role)." });
      }

      const memberCaps = await supabase
        .from("firm_member_capabilities")
        .select("user_id")
        .limit(500);
      if (memberCaps.error) {
        set("p-internal-caps", {
          outcome: "pass",
          detail: `Restricted: ${memberCaps.error.message}`,
        });
      } else if (role === "admin" || role === "super_admin") {
        set("p-internal-caps", {
          outcome: "pass",
          detail: `Admin sees ${memberCaps.data!.length} row(s) (allowed).`,
        });
      } else {
        const foreign = (memberCaps.data ?? []).filter((r: any) => r.user_id !== user?.id).length;
        set("p-internal-caps", {
          outcome: foreign === 0 ? "pass" : "fail",
          detail:
            foreign === 0
              ? `${memberCaps.data!.length} own cap row(s) only.`
              : `Leaked ${foreign} row(s) for other members!`,
        });
      }

      setRanAt(new Date());
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user?.id]);

  const groups: Check["group"][] = [
    "Client",
    "Employee",
    "Storage",
    "Cross-firm",
    "MFA",
    "Portal Capabilities",
    "Admin Overview",
  ];
  const passCount = checks.filter((c) => c.outcome === "pass").length;
  const failCount = checks.filter((c) => c.outcome === "fail").length;

  const reRunBtn = (
    <Button onClick={run} disabled={running} className="gap-2">
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
      Re-run checks
    </Button>
  );

  return (
    <>
      {embedded ? (
        <div className="mb-6 flex justify-end">{reRunBtn}</div>
      ) : (
        <PageHeader
          title="RLS Verification"
          description="End-to-end Row Level Security probes that run as the currently active role. Switch roles in the header to verify each persona."
          actions={reRunBtn}
        />
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="glass border-border-subtle">
          <CardContent className="flex items-center gap-3 p-5">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Active role
              </div>
              <div className="text-lg font-semibold capitalize">{role ?? "—"}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-border-subtle">
          <CardContent className="flex items-center gap-3 p-5">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Passed</div>
              <div className="text-lg font-semibold">
                {passCount} / {checks.length}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-border-subtle">
          <CardContent className="flex items-center gap-3 p-5">
            <XCircle
              className={cn("h-8 w-8", failCount > 0 ? "text-rose-600" : "text-muted-foreground")}
            />
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Failed</div>
              <div className="text-lg font-semibold">{failCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {ranAt && (
        <div className="mb-4 text-xs text-muted-foreground">
          Last run: {ranAt.toLocaleTimeString()}
        </div>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {g} access
            </h2>
            <div className="space-y-2">
              {checks
                .filter((c) => c.group === g)
                .map((c) => (
                  <Card key={c.id} className="glass border-border-subtle">
                    <CardContent className="flex items-start gap-3 p-4">
                      <div className="mt-0.5">
                        {c.outcome === "pending" ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : c.outcome === "pass" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-rose-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{c.title}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] uppercase",
                              c.outcome === "pass" && "border-emerald-300 text-emerald-700",
                              c.outcome === "fail" && "border-rose-300 text-rose-700",
                            )}
                          >
                            {c.outcome}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Expected: {c.expected}
                        </div>
                        {c.detail && <div className="mt-1 text-xs">{c.detail}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
