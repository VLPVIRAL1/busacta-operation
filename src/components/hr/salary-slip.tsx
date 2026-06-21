import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  formatPayPeriod,
  type PayrollRun,
  type PayrollEntry,
  type PayrollSalaryStructure,
} from "@/lib/queries/payroll.queries";

type EmployeeInfo = {
  full_name: string | null;
  employee_id: string | null;
  department: string | null;
  position_title: string | null;
};

interface Props {
  run: PayrollRun;
  entry: PayrollEntry;
  employee: EmployeeInfo;
  structure: PayrollSalaryStructure | null;
  firmName?: string;
}

export function SalarySlip({
  run,
  entry,
  employee,
  structure,
  firmName = "BusAcTa Operations",
}: Props) {
  const period = formatPayPeriod(run.pay_period_year, run.pay_period_month);

  return (
    <>
      {/* Print button — hidden in print view */}
      <div className="flex justify-end mb-4 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print Slip
        </Button>
      </div>

      {/* Slip */}
      <div
        id="salary-slip"
        className="bg-white text-black rounded-lg border shadow-sm p-8 max-w-3xl mx-auto print:shadow-none print:border-none print:rounded-none print:max-w-none print:p-6"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold uppercase tracking-wide">{firmName}</h1>
          <p className="text-sm text-gray-500 mt-1">Salary Slip — {period}</p>
        </div>

        <hr className="border-gray-300 mb-5" />

        {/* Employee details */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6">
          <InfoRow label="Employee Name" value={employee.full_name ?? "—"} />
          <InfoRow label="Employee ID" value={employee.employee_id ?? "—"} />
          <InfoRow label="Department" value={employee.department ?? "—"} />
          <InfoRow label="Designation" value={employee.position_title ?? "—"} />
          <InfoRow label="Pay Period" value={period} />
          <InfoRow label="Working Days" value={String(run.total_working_days)} />
        </div>

        <hr className="border-gray-300 mb-5" />

        {/* Attendance summary */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-3">
            Attendance Summary
          </h3>
          <div className="grid grid-cols-4 gap-3 text-center text-xs">
            <AttBox label="Present" value={entry.present_days} />
            <AttBox label="Half Days" value={entry.half_days} />
            <AttBox label="Paid Days" value={entry.paid_days} />
            <AttBox label="LWP" value={entry.lwp_days} highlight={entry.lwp_days > 0} />
          </div>
          {(entry.cl_days > 0 || entry.sl_days > 0 || entry.el_days > 0) && (
            <div className="grid grid-cols-3 gap-3 text-center text-xs mt-2">
              <AttBox label="CL (Casual)" value={entry.cl_days} />
              <AttBox label="SL (Sick)" value={entry.sl_days} />
              <AttBox label="EL (Earned)" value={entry.el_days} />
            </div>
          )}
        </div>

        <hr className="border-gray-300 mb-5" />

        {/* Earnings & Deductions */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          {/* Earnings */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-3">
              Earnings
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="text-left pb-1 font-medium">Component</th>
                  <th className="text-right pb-1 font-medium">Monthly (₹)</th>
                  <th className="text-right pb-1 font-medium">Actual (₹)</th>
                </tr>
              </thead>
              <tbody>
                {entry.earnings_breakdown.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1">{row.name}</td>
                    <td className="py-1 text-right tabular-nums text-gray-500">
                      {fmt(row.monthly_amount)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{fmt(row.actual_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 font-semibold">
                  <td className="pt-2">Gross Earnings</td>
                  <td />
                  <td className="pt-2 text-right tabular-nums">{fmt(entry.gross_earnings)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deductions */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-3">
              Deductions
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="text-left pb-1 font-medium">Component</th>
                  <th className="text-right pb-1 font-medium">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {entry.pf_employee > 0 && (
                  <tr className="border-t border-gray-100">
                    <td className="py-1">PF (Employee)</td>
                    <td className="py-1 text-right tabular-nums">{fmt(entry.pf_employee)}</td>
                  </tr>
                )}
                {entry.pt_amount > 0 && (
                  <tr className="border-t border-gray-100">
                    <td className="py-1">Professional Tax</td>
                    <td className="py-1 text-right tabular-nums">{fmt(entry.pt_amount)}</td>
                  </tr>
                )}
                {entry.tds_amount > 0 && (
                  <tr className="border-t border-gray-100">
                    <td className="py-1">TDS</td>
                    <td className="py-1 text-right tabular-nums">{fmt(entry.tds_amount)}</td>
                  </tr>
                )}
                {entry.other_deductions.map((d, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1">{d.name}</td>
                    <td className="py-1 text-right tabular-nums">{fmt(d.amount)}</td>
                  </tr>
                ))}
                {entry.total_deductions === 0 && (
                  <tr className="border-t border-gray-100">
                    <td className="py-1 text-gray-400 italic" colSpan={2}>
                      No deductions
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 font-semibold">
                  <td className="pt-2">Total Deductions</td>
                  <td className="pt-2 text-right tabular-nums">{fmt(entry.total_deductions)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <hr className="border-gray-300 mb-5" />

        {/* Net Pay */}
        <div className="flex items-center justify-between bg-gray-50 rounded-md px-6 py-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Net Pay</p>
            <p className="text-sm text-gray-600">Gross Earnings − Total Deductions</p>
          </div>
          <p className="text-3xl font-bold tabular-nums">₹{fmt(entry.net_pay)}</p>
        </div>

        {entry.override_notes && (
          <p className="mt-4 text-xs text-amber-600 bg-amber-50 rounded p-2">
            ⚠ Manual override applied: {entry.override_notes}
          </p>
        )}

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-gray-400">
          This is a computer-generated salary slip and does not require a signature.
        </p>
      </div>

      {/* Print-only CSS */}
      <style>{`
        @media print {
          body > *:not(#salary-slip) { display: none !important; }
          #salary-slip { display: block !important; }
        }
      `}</style>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-36 shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function AttBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded border p-2 ${highlight && value > 0 ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}
    >
      <p className="text-gray-500">{label}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${highlight && value > 0 ? "text-red-600" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
