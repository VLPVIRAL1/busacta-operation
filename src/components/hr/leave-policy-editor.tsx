import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { upsertLeavePolicy } from "@/lib/hr/payroll.functions";
import {
  leavePolicyQuery,
  leaveBalancesQuery,
  type PayrollLeavePolicy,
  type PayrollLeaveBalance,
} from "@/lib/queries/payroll.queries";

const schema = z.object({
  cl_quota: z.coerce.number().nonnegative(),
  sl_quota: z.coerce.number().nonnegative(),
  el_quota: z.coerce.number().nonnegative(),
  el_carry_forward_max: z.coerce.number().nonnegative(),
  cl_carry_forward_max: z.coerce.number().nonnegative(),
  sl_carry_forward_max: z.coerce.number().nonnegative(),
  cl_opening_balance: z.coerce.number().nonnegative(),
  sl_opening_balance: z.coerce.number().nonnegative(),
  el_opening_balance: z.coerce.number().nonnegative(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  policyYear: number;
  current: PayrollLeavePolicy | null;
  balances: PayrollLeaveBalance[];
}

export function LeavePolicyEditor({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  policyYear,
  current,
  balances,
}: Props) {
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(current),
  });

  useEffect(() => {
    if (open) reset(buildDefaults(current));
  }, [open, current, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      upsertLeavePolicy({
        data: {
          employee_id: employeeId,
          policy_year: policyYear,
          ...values,
        },
      }),
    onSuccess: () => {
      toast.success("Leave policy saved");
      qc.invalidateQueries({ queryKey: ["payroll", "leave-policy", employeeId, policyYear] });
      qc.invalidateQueries({ queryKey: ["payroll", "leave-balances", employeeId, policyYear] });
      qc.invalidateQueries({ queryKey: ["payroll", "setup-overview"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balanceByCategory = Object.fromEntries(balances.map((b) => [b.leave_category, b]));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Leave Policy — {employeeName} ({policyYear})
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-5 py-4">
          {/* Annual quotas */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Annual Leave Quotas (days)</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["cl", "sl", "el"] as const).map((cat) => (
              <div key={cat} className="space-y-1">
                <Label>{cat.toUpperCase()} Quota</Label>
                <Input type="number" min={0} step={0.5} {...register(`${cat}_quota` as const)} />
                {errors[`${cat}_quota` as keyof FormValues] && (
                  <p className="text-xs text-destructive">Invalid</p>
                )}
              </div>
            ))}
          </div>

          <Separator />

          {/* Carry forward */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Max Carry-Forward (days)</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["cl", "sl", "el"] as const).map((cat) => (
              <div key={cat} className="space-y-1">
                <Label>{cat.toUpperCase()}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  {...register(`${cat}_carry_forward_max` as const)}
                />
              </div>
            ))}
          </div>

          <Separator />

          {/* Opening balances */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Opening Balances (days, for {policyYear})</p>
            <p className="text-xs text-muted-foreground">
              Only affects newly created balance records.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["cl", "sl", "el"] as const).map((cat) => (
              <div key={cat} className="space-y-1">
                <Label>{cat.toUpperCase()}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  {...register(`${cat}_opening_balance` as const)}
                />
              </div>
            ))}
          </div>

          {/* Current balances display */}
          {balances.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Current Balances</p>
                <div className="grid grid-cols-3 gap-3">
                  {(["cl", "sl", "el"] as const).map((cat) => {
                    const b = balanceByCategory[cat];
                    if (!b) return null;
                    return (
                      <div key={cat} className="rounded-md border p-3 text-center">
                        <p className="text-xs text-muted-foreground uppercase">{cat}</p>
                        <p className="text-xl font-semibold tabular-nums">
                          {b.closing_balance ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {b.opening_balance} + {b.accrued} − {b.consumed}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save Policy"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function buildDefaults(current: PayrollLeavePolicy | null): FormValues {
  return {
    cl_quota: current?.cl_quota ?? 12,
    sl_quota: current?.sl_quota ?? 12,
    el_quota: current?.el_quota ?? 15,
    el_carry_forward_max: current?.el_carry_forward_max ?? 30,
    cl_carry_forward_max: current?.cl_carry_forward_max ?? 0,
    sl_carry_forward_max: current?.sl_carry_forward_max ?? 0,
    cl_opening_balance: current?.cl_opening_balance ?? 0,
    sl_opening_balance: current?.sl_opening_balance ?? 0,
    el_opening_balance: current?.el_opening_balance ?? 0,
  };
}
