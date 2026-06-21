import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarRange,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Eye,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Tag,
  TrendingUp,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { FacetedMultiChip } from "@/components/shared/faceted-multi-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { listAllDeployments } from "@/lib/organizer/tracking.functions";
import { getTrackingOverview } from "@/lib/organizer/overview.functions";
import {
  sendReminder,
  reopenDeployment,
  cancelDeployment,
} from "@/lib/organizer/lifecycle.functions";
import { deploymentStatusSchema, type DeploymentStatus } from "@/lib/organizer/schemas";
import { supabase } from "@/integrations/supabase/client";
import { EditAssignmentDialog } from "@/components/organizer/edit-assignment-dialog";

const ALL_STATUSES = deploymentStatusSchema.options;

export const Route = createFileRoute("/organizer/tracking")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Organizer", to: "/organizer" }, { label: "Tracking" }]}>
        <TrackingPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type DueWindow = "any" | "overdue" | "next_7d" | "next_30d";

interface EditingRow {
  id: string;
  template_name: string;
  assignee_profile_id: string;
  assignee_name: string | null;
  due_at: string | null;
  status: string;
}

function TrackingPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAllDeployments);
  const overviewFn = useServerFn(getTrackingOverview);
  const remind = useServerFn(sendReminder);
  const reopen = useServerFn(reopenDeployment);
  const cancel = useServerFn(cancelDeployment);

  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [templateSel, setTemplateSel] = useState<string[]>([]);
  const [assigneeSel, setAssigneeSel] = useState<string[]>([]);
  const [dueWindow, setDueWindow] = useState<DueWindow>("any");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditingRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["organizer", "tracking"],
    queryFn: () => list({ data: {} }),
  });

  const { data: overview } = useQuery({
    queryKey: ["organizer", "tracking-overview"],
    queryFn: () => overviewFn(),
  });

  // Realtime: any update on organizer_deployments invalidates the cache.
  useEffect(() => {
    const ch = supabase
      .channel("organizer-tracking-all")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "organizer_deployments",
        },
        () => {
          qc.invalidateQueries({ queryKey: ["organizer", "tracking"] });
          qc.invalidateQueries({
            queryKey: ["organizer", "tracking-overview"],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const all = data?.deployments ?? [];

  const filtered = useMemo(() => {
    const now = Date.now();
    const sevenD = now + 7 * 24 * 3600 * 1000;
    const thirtyD = now + 30 * 24 * 3600 * 1000;
    const needle = search.trim().toLowerCase();
    return all.filter((r) => {
      if (statusSel.length > 0 && !statusSel.includes(r.status)) return false;
      if (templateSel.length > 0 && !templateSel.includes(r.template_id)) return false;
      if (assigneeSel.length > 0 && !assigneeSel.includes(r.assignee_profile_id)) return false;
      if (dueWindow !== "any") {
        if (!r.due_at) return false;
        const due = new Date(r.due_at).getTime();
        if (dueWindow === "overdue" && due >= now) return false;
        if (dueWindow === "next_7d" && (due < now || due > sevenD)) return false;
        if (dueWindow === "next_30d" && (due < now || due > thirtyD)) return false;
      }
      if (needle) {
        const hay =
          `${r.template_name} ${r.assignee_name ?? ""} ${r.assignee_email ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [all, statusSel, templateSel, assigneeSel, dueWindow, search]);

  // Facet options + counts derived from full result set.
  const statusOptions = ALL_STATUSES.map((s) => ({
    value: s,
    label: s.replace("_", " "),
  }));
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [all]);

  const templateOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) m.set(r.template_id, r.template_name);
    return Array.from(m.entries()).map(([value, label]) => ({ value, label }));
  }, [all]);
  const templateCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) m.set(r.template_id, (m.get(r.template_id) ?? 0) + 1);
    return m;
  }, [all]);

  const assigneeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) m.set(r.assignee_profile_id, r.assignee_name ?? r.assignee_email ?? "—");
    return Array.from(m.entries()).map(([value, label]) => ({ value, label }));
  }, [all]);
  const assigneeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) m.set(r.assignee_profile_id, (m.get(r.assignee_profile_id) ?? 0) + 1);
    return m;
  }, [all]);

  const dueOptions = [
    { value: "any", label: "Any time" },
    { value: "overdue", label: "Overdue" },
    { value: "next_7d", label: "Next 7 days" },
    { value: "next_30d", label: "Next 30 days" },
  ];

  const onAction = async (label: string, fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
      qc.invalidateQueries({ queryKey: ["organizer", "tracking"] });
    } catch (e) {
      toast.error(`${label}: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <PageHeader
        title="Organizer Tracking"
        description="All deployed organizers, exams, and questionnaires across the company."
      />

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <OverviewCard
          icon={<Activity className="h-4 w-4" />}
          label="Active"
          value={overview?.active ?? "—"}
        />
        <OverviewCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Submitted (7d)"
          value={overview?.submitted_7d ?? "—"}
        />
        <OverviewCard
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          label="Overdue"
          value={overview?.overdue ?? "—"}
        />
        <OverviewCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          label="Avg completion"
          value={
            overview?.avg_completion_pct !== undefined ? `${overview.avg_completion_pct}%` : "—"
          }
        />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs"
              placeholder="Search template, assignee name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FacetedMultiChip
              icon={<CircleDot className="h-3 w-3" />}
              label="Status"
              options={statusOptions}
              selected={statusSel}
              onChange={setStatusSel}
              counts={statusCounts}
            />
            <FacetedMultiChip
              icon={<ClipboardList className="h-3 w-3" />}
              label="Template"
              options={templateOptions}
              selected={templateSel}
              onChange={setTemplateSel}
              counts={templateCounts}
            />
            <FacetedMultiChip
              icon={<User className="h-3 w-3" />}
              label="Assignee"
              options={assigneeOptions}
              selected={assigneeSel}
              onChange={setAssigneeSel}
              counts={assigneeCounts}
              showAvatars
            />
            <FacetedMultiChip
              icon={<CalendarRange className="h-3 w-3" />}
              label="Due"
              options={dueOptions}
              selected={dueWindow === "any" ? [] : [dueWindow]}
              onChange={(v) => setDueWindow((v[v.length - 1] as DueWindow) ?? "any")}
            />
            {(statusSel.length ||
              templateSel.length ||
              assigneeSel.length ||
              dueWindow !== "any") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => {
                  setStatusSel([]);
                  setTemplateSel([]);
                  setAssigneeSel([]);
                  setDueWindow("any");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={<ListChecks className="h-10 w-10" />}
                title="No deployments match"
                description="Adjust filters or deploy a template from the Templates page."
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Template</th>
                  <th className="text-left px-3 py-2">Assignee</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Due</th>
                  <th className="text-left px-3 py-2">Score</th>
                  <th className="text-left px-3 py-2">Submitted</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const canReopen = ["submitted", "under_review", "graded", "returned"].includes(
                    r.status,
                  );
                  const canCancel = (r.status as string) !== "cancelled";
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30 align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.template_name}</div>
                        <div className="text-xs text-muted-foreground">
                          v{r.template_version}
                          {r.template_is_exam && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              Exam
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div>{r.assignee_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.assignee_email}</div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.due_at ? new Date(r.due_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.score !== null ? r.score : "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Review"
                            aria-label="Review"
                          >
                            <Link
                              to="/organizer/review/$deploymentId"
                              params={{ deploymentId: r.id }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="More"
                                aria-label="More"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() =>
                                  setEditing({
                                    id: r.id,
                                    template_name: r.template_name,
                                    assignee_profile_id: r.assignee_profile_id,
                                    assignee_name: r.assignee_name,
                                    due_at: r.due_at,
                                    status: r.status,
                                  })
                                }
                              >
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Edit assignment
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  onAction(
                                    "Reminder",
                                    () => remind({ data: { id: r.id } }),
                                    "Reminder sent",
                                  )
                                }
                                disabled={
                                  (r.status as string) === "cancelled" || r.status === "graded"
                                }
                              >
                                Send reminder
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  onAction(
                                    "Reopen",
                                    () => reopen({ data: { id: r.id } }),
                                    "Reopened",
                                  )
                                }
                                disabled={!canReopen}
                              >
                                Reopen
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  if (
                                    !confirm(
                                      "Cancel this deployment? The assignee won't be able to submit.",
                                    )
                                  )
                                    return;
                                  void onAction(
                                    "Cancel",
                                    () => cancel({ data: { id: r.id } }),
                                    "Cancelled",
                                  );
                                }}
                                disabled={!canCancel}
                                className="text-destructive"
                              >
                                Cancel deployment
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EditAssignmentDialog
          open={!!editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          deploymentId={editing.id}
          current={{
            assignee_profile_id: editing.assignee_profile_id,
            assignee_name: editing.assignee_name,
            due_at: editing.due_at,
            status: editing.status,
            template_name: editing.template_name,
          }}
        />
      )}
    </>
  );
}

function OverviewCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: DeploymentStatus | "cancelled" }) {
  const map: Record<string, string> = {
    not_started: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    submitted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    graded: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
    returned: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
    cancelled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 line-through",
  };
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize ${map[status] ?? map.not_started}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// Silence unused imports lint if any
void Building2;
void Tag;
