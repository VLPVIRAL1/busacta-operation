import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, CheckCircle2, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { approvePayrollRun, markPayrollRunPaid } from "@/lib/hr/payroll.functions";
import { formatPayPeriod, type PayrollRun, type PayrollEntry } from "@/lib/queries/payroll.queries";

type ProfileLite = {
  id: string;
  full_name: string | null;
  employee_id: string | null;
  department: string | null;
  position_title: string | null;
};

interface Props {
  run: PayrollRun;
  entries: PayrollEntry[];
  profiles: ProfileLite[];
}

export function PayrollSummaryTable({ run, entries, profiles }: Props) {
  const qc = useQueryClient();
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const approveMutation = useMutation({
    mutationFn: () => approvePayrollRun({ data: { run_id: run.id } }),
    onSuccess: () => {
      toast.success("Payroll run approved and entries locked");
      qc.invalidateQueries({ queryKey: ["payroll", "run", run.id] });
      qc.invalidateQueries({ queryKey: ["payroll", "runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paidMutation = useMutation({
    mutationFn: () => markPayrollRunPaid({ data: { run_id: run.id } }),
    onSuccess: () => {
      toast.success("Payroll marked as paid");
      qc.invalidateQueries({ queryKey: ["payroll", "run", run.id] });
      qc.invalidateQueries({ queryKey: ["payroll", "runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalGross = entries.reduce((s, e) => s + e.gross_earnings, 0);
  const totalDeductions = entries.reduce((s, e) => s + e.total_deductions, 0);
  const totalNet = entries.reduce((s, e) => s + e.net_pay, 0);

  const canApprove = run.status === "draft";
  const canMarkPaid = run.status === "approved";

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">
            {formatPayPeriod(run.pay_period_year, run.pay_period_month)}
          </h2>
          <RunStatusBadge status={run.status} />
          <span className="text-sm text-muted-foreground">
            {run.total_working_days} working days · {entries.length} employees
          </span>
        </div>
        <div className="flex gap-2">
          {canApprove && (
            <Button
              size="sm"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending || entries.length === 0}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {approveMutation.isPending ? "Approving…" : "Approve Run"}
            </Button>
          )}
          {canMarkPaid && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => paidMutation.mutate()}
              disabled={paidMutation.isPending}
            >
              <IndianRupee className="h-4 w-4 mr-1" />
              {paidMutation.isPending ? "Updating…" : "Mark as Paid"}
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Working Days</TableHead>
              <TableHead className="text-right">Present</TableHead>
              <TableHead className="text-right">Half Days</TableHead>
              <TableHead className="text-right">CL</TableHead>
              <TableHead className="text-right">SL</TableHead>
              <TableHead className="text-right">EL</TableHead>
              <TableHead className="text-right">LWP</TableHead>
              <TableHead className="text-right">Gross (₹)</TableHead>
              <TableHead className="text-right">Deductions (₹)</TableHead>
              <TableHead className="text-right">Net Pay (₹)</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-10 text-muted-foreground">
                  No entries yet. Click "Compute" on the dashboard to calculate payroll.
                </TableCell>
              </TableRow>
            )}
            {entries.map((entry) => {
              const profile = profileMap.get(entry.employee_id);
              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{profile?.full_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{profile?.employee_id}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {entry.total_working_days}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{entry.present_days}</TableCell>
                  <TableCell className="text-right tabular-nums">{entry.half_days}</TableCell>
                  <TableCell className="text-right tabular-nums">{entry.cl_days}</TableCell>
                  <TableCell className="text-right tabular-nums">{entry.sl_days}</TableCell>
                  <TableCell className="text-right tabular-nums">{entry.el_days}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">
                    {entry.lwp_days > 0 ? entry.lwp_days : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(entry.gross_earnings)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">
                    {fmt(entry.total_deductions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmt(entry.net_pay)}
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/hr/payroll/slip/$runId/$employeeId"
                      params={{ runId: run.id, employeeId: entry.employee_id }}
                    >
                      <Button variant="ghost" size="icon" title="View slip">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="bg-muted/40 font-semibold text-sm">
                <td className="p-2 pl-4" colSpan={8}>
                  Total
                </td>
                <td className="p-2 text-right tabular-nums">{fmt(totalGross)}</td>
                <td className="p-2 text-right tabular-nums text-destructive">
                  {fmt(totalDeductions)}
                </td>
                <td className="p-2 text-right tabular-nums">{fmt(totalNet)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </Table>
      </div>
    </div>
  );
}

function RunStatusBadge({ status }: { status: PayrollRun["status"] }) {
  const map: Record<PayrollRun["status"], { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    processing: {
      label: "Processing",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
    },
    approved: {
      label: "Approved",
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
    },
    paid: {
      label: "Paid",
      className: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200",
    },
    cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
  };
  const { label, className } = map[status] ?? map.draft;
  return (
    <Badge className={className} variant="outline">
      {label}
    </Badge>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
