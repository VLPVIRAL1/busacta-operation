import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertSalaryStructure } from "@/lib/hr/payroll.functions";
import type { PayrollSalaryStructure } from "@/lib/queries/payroll.queries";

const schema = z.object({
  effective_from: z.string().min(1),
  effective_to: z.string().optional(),
  basic_monthly: z.coerce.number().nonnegative(),
  hra_monthly: z.coerce.number().nonnegative(),
  ta_monthly: z.coerce.number().nonnegative(),
  other_components: z.array(
    z.object({
      name: z.string().min(1),
      amount: z.coerce.number().nonnegative(),
      type: z.enum(["earning", "deduction"]),
    }),
  ),
  pf_applicable: z.boolean(),
  pt_applicable: z.boolean(),
  tds_monthly: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  current: PayrollSalaryStructure | null;
}

export function SalaryStructureEditor({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  current,
}: Props) {
  const qc = useQueryClient();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      effective_from: current?.effective_from ?? new Date().toISOString().slice(0, 10),
      effective_to: current?.effective_to ?? "",
      basic_monthly: current?.basic_monthly ?? 0,
      hra_monthly: current?.hra_monthly ?? 0,
      ta_monthly: current?.ta_monthly ?? 0,
      other_components: current?.other_components ?? [],
      pf_applicable: current?.pf_applicable ?? false,
      pt_applicable: current?.pt_applicable ?? false,
      tds_monthly: current?.tds_monthly ?? 0,
      notes: current?.notes ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "other_components" });

  useEffect(() => {
    if (open) {
      reset({
        effective_from: current?.effective_from ?? new Date().toISOString().slice(0, 10),
        effective_to: current?.effective_to ?? "",
        basic_monthly: current?.basic_monthly ?? 0,
        hra_monthly: current?.hra_monthly ?? 0,
        ta_monthly: current?.ta_monthly ?? 0,
        other_components: current?.other_components ?? [],
        pf_applicable: current?.pf_applicable ?? false,
        pt_applicable: current?.pt_applicable ?? false,
        tds_monthly: current?.tds_monthly ?? 0,
        notes: current?.notes ?? "",
      });
    }
  }, [open, current, reset]);

  const basic = Number(watch("basic_monthly") || 0);
  const hra = Number(watch("hra_monthly") || 0);
  const ta = Number(watch("ta_monthly") || 0);
  const otherComps = watch("other_components") ?? [];
  const earningsTotal =
    basic +
    hra +
    ta +
    otherComps.filter((c) => c.type === "earning").reduce((s, c) => s + Number(c.amount || 0), 0);
  const ctc = earningsTotal;

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      upsertSalaryStructure({
        data: {
          employee_id: employeeId,
          effective_from: values.effective_from,
          effective_to: values.effective_to || null,
          basic_monthly: values.basic_monthly,
          hra_monthly: values.hra_monthly,
          ta_monthly: values.ta_monthly,
          other_components: values.other_components,
          pf_applicable: values.pf_applicable,
          pt_applicable: values.pt_applicable,
          tds_monthly: values.tds_monthly,
          ctc_monthly: ctc,
          notes: values.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Salary structure saved");
      qc.invalidateQueries({ queryKey: ["payroll", "structure", employeeId] });
      qc.invalidateQueries({ queryKey: ["payroll", "setup-overview"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Salary Structure — {employeeName}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-5 py-4">
          {/* Effective dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Effective From *</Label>
              <Input type="date" {...register("effective_from")} />
              {errors.effective_from && (
                <p className="text-xs text-destructive">{errors.effective_from.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Effective To</Label>
              <Input
                type="date"
                {...register("effective_to")}
                placeholder="Leave blank if current"
              />
            </div>
          </div>

          <Separator />

          {/* Fixed components */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Fixed Components</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Basic (₹/mo)</Label>
              <Input type="number" min={0} step={0.01} {...register("basic_monthly")} />
            </div>
            <div className="space-y-1">
              <Label>HRA (₹/mo)</Label>
              <Input type="number" min={0} step={0.01} {...register("hra_monthly")} />
            </div>
            <div className="space-y-1">
              <Label>TA (₹/mo)</Label>
              <Input type="number" min={0} step={0.01} {...register("ta_monthly")} />
            </div>
          </div>

          <Separator />

          {/* Dynamic components */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Other Components</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => append({ name: "", amount: 0, type: "earning" })}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-[1fr_100px_110px_32px] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    placeholder="e.g. Special Allowance"
                    {...register(`other_components.${idx}.name`)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    {...register(`other_components.${idx}.amount`)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    defaultValue={field.type}
                    onValueChange={(v) =>
                      setValue(`other_components.${idx}.type`, v as "earning" | "deduction")
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="earning">Earning</SelectItem>
                      <SelectItem value="deduction">Deduction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          {/* Statutory */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Statutory Deductions</p>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pf"
                  checked={watch("pf_applicable")}
                  onCheckedChange={(v) => setValue("pf_applicable", !!v)}
                />
                <Label htmlFor="pf">PF applicable (12% of Basic)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pt"
                  checked={watch("pt_applicable")}
                  onCheckedChange={(v) => setValue("pt_applicable", !!v)}
                />
                <Label htmlFor="pt">PT applicable (slab-based)</Label>
              </div>
            </div>
            <div className="w-40 space-y-1">
              <Label>TDS (₹/mo)</Label>
              <Input type="number" min={0} step={0.01} {...register("tds_monthly")} />
            </div>
          </div>

          <Separator />

          {/* CTC summary */}
          <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
            <span className="text-sm font-medium">CTC (Monthly)</span>
            <span className="text-lg font-semibold tabular-nums">
              ₹{ctc.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Input placeholder="Optional notes" {...register("notes")} />
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save Structure"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
