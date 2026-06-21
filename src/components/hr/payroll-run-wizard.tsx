import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPayrollRun, computePayrollRun } from "@/lib/hr/payroll.functions";
import { MONTH_NAMES } from "@/lib/queries/payroll.queries";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingRunMonths: Array<{ year: number; month: number }>;
}

type Step = "select" | "computing" | "done";

export function PayrollRunWizard({ open, onOpenChange, existingRunMonths }: Props) {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [step, setStep] = useState<Step>("select");
  const [warnings, setWarnings] = useState<string[]>([]);

  const alreadyExists = existingRunMonths.some((r) => r.year === year && r.month === month);

  const createMutation = useMutation({
    mutationFn: () => createPayrollRun({ data: { year, month } }),
    onSuccess: async (run: any) => {
      setStep("computing");
      computeMutation.mutate(run.id);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setStep("select");
    },
  });

  const computeMutation = useMutation({
    mutationFn: (runId: string) => computePayrollRun({ data: { run_id: runId } }),
    onSuccess: (result: any) => {
      setWarnings(result.warnings ?? []);
      setStep("done");
      toast.success(`Payroll computed — ${result.entriesComputed} employees processed`);
      setTimeout(() => {
        onOpenChange(false);
        setStep("select");
        navigate({ to: "/hr/payroll/run/$runId", params: { runId: result.runId } });
      }, 1500);
    },
    onError: (e: Error) => {
      toast.error(`Computation failed: ${e.message}`);
      setStep("select");
    },
  });

  function handleClose() {
    if (step === "computing") return;
    onOpenChange(false);
    setStep("select");
    setWarnings([]);
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Payroll Run</DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Year</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Month</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {alreadyExists && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  A payroll run already exists for {MONTH_NAMES[month - 1]} {year}. Creating another
                  will fail.
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Attendance data will be pulled from all imported biometric records for{" "}
              {MONTH_NAMES[month - 1]} {year}. Make sure attendance has been imported before
              proceeding.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={alreadyExists || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…
                  </>
                ) : (
                  "Compute Payroll"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "computing" && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">
              Computing payroll for {MONTH_NAMES[month - 1]} {year}…
            </p>
            <p className="text-xs text-muted-foreground">This may take a few seconds.</p>
          </div>
        )}

        {step === "done" && (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
            <p className="font-medium">Payroll computed successfully!</p>
            {warnings.length > 0 && (
              <div className="text-left space-y-1 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-amber-600">Warnings ({warnings.length}):</p>
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {w}
                  </p>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground">Redirecting to run review…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
