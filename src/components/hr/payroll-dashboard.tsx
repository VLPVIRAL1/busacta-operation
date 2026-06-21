import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Banknote, Users, CalendarCheck2, IndianRupee, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { cn } from "@/lib/shared/utils";
import { PayrollRunWizard } from "./payroll-run-wizard";
import { PayrollSummaryTable } from "./payroll-summary-table";
import {
  payrollRunsQuery,
  payrollRunQuery,
  formatPayPeriod,
  type PayrollRun,
} from "@/lib/queries/payroll.queries";
import { computePayrollRun } from "@/lib/hr/payroll.functions";
import { supabase } from "@/integrations/supabase/client";

export function PayrollDashboard() {
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { data: runs, isLoading } = useQuery(payrollRunsQuery());

  const latestRun = runs?.[0];
  const paidRuns = runs?.filter((r) => r.status === "paid") ?? [];
  const pendingRuns = runs?.filter((r) => r.status === "draft" || r.status === "approved") ?? [];

  const existingRunMonths = (runs ?? []).map((r) => ({
    year: r.pay_period_year,
    month: r.pay_period_month,
  }));

  // Auto-select the latest run when none is chosen and runs exist
  useEffect(() => {
    if (!selectedRunId && runs && runs.length > 0) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  const leftPane = (
    <PayPeriodList
      runs={runs ?? []}
      isLoading={isLoading}
      selectedId={selectedRunId}
      onSelect={setSelectedRunId}
      onNewRun={() => setWizardOpen(true)}
    />
  );

  const rightPane = selectedRunId ? (
    <PayDetailsPane
      key={selectedRunId}
      runId={selectedRunId}
      onInvalidateRuns={() => qc.invalidateQueries({ queryKey: ["payroll", "runs"] })}
    />
  ) : (
    <div className="h-full flex items-center justify-center border rounded-lg bg-background">
      <EmptyState
        icon={<Banknote className="h-8 w-8" />}
        title={runs?.length ? "Select a pay period" : "No payroll runs yet"}
        description={
          runs?.length
            ? "Pick a period from the left to view and edit details."
            : "Create your first payroll run to get started."
        }
        action={
          !runs?.length ? (
            <Button size="sm" onClick={() => setWizardOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Payroll Run
            </Button>
          ) : null
        }
      />
    </div>
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col p-2 gap-3">
      {/* "New Payroll Run" action row */}
      <div className="flex items-center justify-end">
        <Button size="sm" className="h-7 text-xs" onClick={() => setWizardOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New Payroll Run
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Runs"
          value={isLoading ? undefined : (runs?.length ?? 0)}
          icon={<CalendarCheck2 className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Pending Approval"
          value={isLoading ? undefined : pendingRuns.length}
          tone={pendingRuns.length > 0 ? "warn" : undefined}
          icon={<Banknote className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Paid Runs"
          value={isLoading ? undefined : paidRuns.length}
          tone={paidRuns.length > 0 ? "ok" : undefined}
          icon={<IndianRupee className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Latest Period"
          value={
            isLoading
              ? undefined
              : latestRun
                ? formatPayPeriod(latestRun.pay_period_year, latestRun.pay_period_month)
                : "—"
          }
          icon={<Users className="h-4 w-4" />}
          loading={isLoading}
        />
      </div>

      {/* Two-pane: pay periods (left) + pay details (right) */}
      <div className="flex-1 min-h-0">
        <ResizableTwoPane
          storageKey="hr-payroll-runs"
          defaultLeft={30}
          minLeft={22}
          maxLeft={50}
          hideToolbar
          left={leftPane}
          right={rightPane}
        />
      </div>

      <PayrollRunWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        existingRunMonths={existingRunMonths}
      />
    </div>
  );
}

// ── Left: pay period list ─────────────────────────────────────────────

function PayPeriodList({
  runs,
  isLoading,
  selectedId,
  onSelect,
  onNewRun,
}: {
  runs: PayrollRun[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewRun: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden border rounded-lg bg-background">
      <div className="shrink-0 flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pay Periods
        </h2>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onNewRun}>
          <Plus className="h-3 w-3" /> New
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">No payroll runs yet.</div>
        ) : (
          <ul className="divide-y">
            {runs.map((run) => {
              const isActive = run.id === selectedId;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(run.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors",
                      isActive && "bg-primary/10 hover:bg-primary/15",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">
                        {formatPayPeriod(run.pay_period_year, run.pay_period_month)}
                      </div>
                      <RunStatusBadge status={run.status} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>{run.total_working_days} working days</span>
                      {run.approved_at && <span>· approved</span>}
                      {run.paid_at && <span>· paid</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Right: editable pay details ───────────────────────────────────────

function PayDetailsPane({
  runId,
  onInvalidateRuns,
}: {
  runId: string;
  onInvalidateRuns: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(payrollRunQuery(runId));

  // Editable header fields (working days + notes) — only meaningful for draft runs
  const [workingDays, setWorkingDays] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.run) {
      setWorkingDays(data.run.total_working_days);
      setNotes(data.run.notes ?? "");
      setDirty(false);
    }
  }, [data?.run]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("payroll_runs")
        .update({ total_working_days: workingDays, notes: notes.trim() || null })
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pay period saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["payroll", "run", runId] });
      onInvalidateRuns();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recomputeMut = useMutation({
    mutationFn: () => computePayrollRun({ data: { run_id: runId } }),
    onSuccess: (result: any) => {
      toast.success(`Recomputed — ${result.entriesComputed} employees`);
      if (result.warnings?.length) {
        result.warnings.forEach((w: string) => toast.warning(w, { duration: 6000 }));
      }
      qc.invalidateQueries({ queryKey: ["payroll", "run", runId] });
      onInvalidateRuns();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="h-full border rounded-lg bg-background p-4 space-y-3">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { run, entries, profiles } = data;
  const isDraft = run.status === "draft";

  return (
    <div className="flex h-full flex-col overflow-hidden border rounded-lg bg-background">
      {/* Editable run header */}
      <div className="shrink-0 border-b p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold">
              {formatPayPeriod(run.pay_period_year, run.pay_period_month)}
            </h2>
            <RunStatusBadge status={run.status} />
          </div>
          <div className="flex items-center gap-2">
            {isDraft && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => recomputeMut.mutate()}
                disabled={recomputeMut.isPending}
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", recomputeMut.isPending && "animate-spin")}
                />
                {recomputeMut.isPending ? "Recomputing…" : "Recompute"}
              </Button>
            )}
            {isDraft && (
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => saveMut.mutate()}
                disabled={!dirty || saveMut.isPending}
              >
                <Save className="h-3.5 w-3.5" /> {saveMut.isPending ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium">Working days</Label>
            <Input
              type="number"
              min={0}
              max={31}
              className="h-8 text-sm"
              value={workingDays}
              disabled={!isDraft}
              onChange={(e) => {
                setWorkingDays(Number(e.target.value) || 0);
                setDirty(true);
              }}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px] font-medium">Notes</Label>
            <Textarea
              rows={1}
              className="text-sm min-h-8 resize-none"
              value={notes}
              disabled={!isDraft}
              placeholder={isDraft ? "Add notes for this pay period…" : "—"}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </div>
      </div>

      {/* Entries table (already includes Approve / Mark Paid in its toolbar) */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <PayrollSummaryTable run={run} entries={entries} profiles={profiles} />
      </div>
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: PayrollRun["status"] }) {
  const map: Record<PayrollRun["status"], { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    processing: { label: "Processing", className: "bg-blue-100 text-blue-700" },
    approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
    paid: { label: "Paid", className: "bg-violet-100 text-violet-700" },
    cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
  };
  const { label, className } = map[status] ?? map.draft;
  return (
    <Badge className={className} variant="outline">
      {label}
    </Badge>
  );
}
