import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Settings2, CalendarClock, CalendarCheck, Plus, Trash2, Search, Users } from "lucide-react";
// CalendarClock kept for the Leave Policy tab trigger icon
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { EmptyState } from "@/components/shared/empty-state";
import {
  salaryStructureQuery,
  leavePolicyQuery,
  leaveBalancesQuery,
} from "@/lib/queries/payroll.queries";
import type { PayrollSalaryStructure } from "@/lib/queries/payroll.queries";
import {
  getPayrollSetupOverview,
  upsertLeavePolicy,
  upsertSalaryStructure,
  updateEmployeePayrollAssignments,
} from "@/lib/hr/payroll.functions";
import { cn } from "@/lib/shared/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type AttendancePolicy = {
  id: string;
  name: string | null;
  standard_start_time: string;
  standard_end_time: string;
  el_quota?: number;
  cl_quota?: number;
  sl_quota?: number;
  el_carry_forward_max?: number;
  cl_carry_forward_max?: number;
  sl_carry_forward_max?: number;
  el_opening_balance?: number;
  cl_opening_balance?: number;
  sl_opening_balance?: number;
  opening_balance_date?: string | null;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  employee_id: string | null;
  department: string | null;
  position_title: string | null;
  attendance_settings_id: string | null;
  holiday_calendar_year: number | null;
  salaryStructure: any | null;
  leavePolicy: any | null;
};

type LeaveForm = {
  cl_quota: number;
  sl_quota: number;
  el_quota: number;
  cl_carry_forward_max: number;
  sl_carry_forward_max: number;
  el_carry_forward_max: number;
  cl_opening_balance: number;
  sl_opening_balance: number;
  el_opening_balance: number;
};

// ── Salary form schema ────────────────────────────────────────────────────────

const salarySchema = z.object({
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

type SalaryFormValues = z.infer<typeof salarySchema>;

// ── Shared constants ──────────────────────────────────────────────────────────

const currentYear = new Date().getFullYear();

const setupOverviewQuery = (year: number) =>
  queryOptions({
    queryKey: ["payroll", "setup-overview", year],
    queryFn: () => getPayrollSetupOverview({ data: { year } }),
    staleTime: 60_000,
  });

function buildLeaveForm(policy: any | null): LeaveForm {
  return {
    cl_quota: policy?.cl_quota ?? 12,
    sl_quota: policy?.sl_quota ?? 12,
    el_quota: policy?.el_quota ?? 18,
    cl_carry_forward_max: policy?.cl_carry_forward_max ?? 0,
    sl_carry_forward_max: policy?.sl_carry_forward_max ?? 0,
    el_carry_forward_max: policy?.el_carry_forward_max ?? 30,
    cl_opening_balance: policy?.cl_opening_balance ?? 0,
    sl_opening_balance: policy?.sl_opening_balance ?? 0,
    el_opening_balance: policy?.el_opening_balance ?? 0,
  };
}

function salaryDefaults(current: PayrollSalaryStructure | null | undefined): SalaryFormValues {
  return {
    effective_from: current?.effective_from ?? new Date().toISOString().slice(0, 10),
    effective_to: current?.effective_to ?? "",
    basic_monthly: current?.basic_monthly ?? 0,
    hra_monthly: current?.hra_monthly ?? 0,
    ta_monthly: current?.ta_monthly ?? 0,
    other_components: (current?.other_components as any[]) ?? [],
    pf_applicable: current?.pf_applicable ?? false,
    pt_applicable: current?.pt_applicable ?? false,
    tds_monthly: current?.tds_monthly ?? 0,
    notes: (current as any)?.notes ?? "",
  };
}

// ── Root component ────────────────────────────────────────────────────────────

export function PayrollEmployeeSetup({ initialEmployeeId }: { initialEmployeeId?: string } = {}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialEmployeeId ?? null);
  const [search, setSearch] = useState("");

  const { data: overview, isLoading } = useQuery(setupOverviewQuery(currentYear));
  const empList = ((overview as any)?.employees as EmployeeRow[]) ?? [];
  const attendancePolicies = ((overview as any)?.attendancePolicies as AttendancePolicy[]) ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return empList;
    return empList.filter(
      (e) =>
        e.full_name?.toLowerCase().includes(q) ||
        e.employee_id?.toLowerCase().includes(q) ||
        e.department?.toLowerCase().includes(q),
    );
  }, [empList, search]);

  // Auto-select first employee once loaded (skip if initialEmployeeId provided)
  useEffect(() => {
    if (!selectedId && empList.length > 0) setSelectedId(empList[0].id);
  }, [empList, selectedId]);

  const selected = empList.find((e) => e.id === selectedId) ?? null;

  const leftPane = (
    <div className="h-full flex flex-col overflow-hidden border rounded-lg bg-background">
      {/* Search toolbar */}
      <div className="shrink-0 border-b px-2 py-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>

      {/* Employee list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title="No matches"
              description="Adjust search or check employee list."
            />
          </div>
        ) : (
          filtered.map((emp) => {
            const isActive = selectedId === emp.id;
            return (
              <button
                key={emp.id}
                type="button"
                onClick={() => setSelectedId(emp.id)}
                className={cn(
                  "w-full text-left rounded-md border-l-2 pl-2 pr-2.5 py-2 transition-colors",
                  "border-y border-r hover:bg-violet-500/5",
                  isActive
                    ? "bg-violet-500/10 border-l-violet-400/60 border-y-violet-500/30 border-r-violet-500/30"
                    : "border-l-violet-400/30 border-y-transparent border-r-transparent",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium truncate flex-1">
                    {emp.full_name ?? "Unnamed"}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {emp.employee_id && (
                    <span className="text-[10px] font-mono text-primary/70 shrink-0">
                      {emp.employee_id}
                    </span>
                  )}
                  {emp.department && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {emp.department}
                    </span>
                  )}
                  <div className="flex gap-1 ml-auto shrink-0">
                    <span
                      className={cn(
                        "inline-block w-1.5 h-1.5 rounded-full",
                        emp.salaryStructure ? "bg-emerald-500" : "bg-amber-400",
                      )}
                      title={emp.salaryStructure ? "Salary configured" : "Salary missing"}
                    />
                    <span
                      className={cn(
                        "inline-block w-1.5 h-1.5 rounded-full",
                        emp.leavePolicy ? "bg-emerald-500" : "bg-amber-400",
                      )}
                      title={emp.leavePolicy ? "Leave policy set" : "Leave policy missing"}
                    />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const rightPane = selected ? (
    <EmployeeDetail key={selected.id} employee={selected} attendancePolicies={attendancePolicies} />
  ) : (
    <div className="h-full flex items-center justify-center border rounded-lg bg-background">
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="Select an employee"
        description="Pick someone from the list to configure payroll."
      />
    </div>
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col p-2">
      <div className="flex-1 min-h-0">
        <ResizableTwoPane
          storageKey="hr-payroll-setup"
          defaultLeft={26}
          minLeft={18}
          maxLeft={40}
          hideToolbar
          left={leftPane}
          right={rightPane}
        />
      </div>
    </div>
  );
}

// ── Employee detail (right pane) ──────────────────────────────────────────────

function EmployeeDetail({
  employee,
  attendancePolicies,
}: {
  employee: EmployeeRow;
  attendancePolicies: AttendancePolicy[];
}) {
  return (
    <Tabs
      defaultValue="salary"
      className="h-full flex flex-col overflow-hidden border rounded-lg bg-background"
    >
      {/* Header */}
      <div className="shrink-0 border-b bg-gradient-to-br from-primary/5 via-background to-background px-4 pt-4 pb-3 space-y-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{employee.full_name ?? "—"}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {[employee.position_title, employee.department].filter(Boolean).join(" · ") ||
              employee.employee_id ||
              "—"}
          </p>
        </div>
        <AssignmentRow employee={employee} attendancePolicies={attendancePolicies} />
      </div>

      {/* Underline tab bar — same style as employee directory */}
      <div className="shrink-0 border-b px-3 pt-1 bg-background overflow-x-auto">
        <TabsList className="h-auto w-max gap-1 rounded-none bg-transparent p-0">
          <TabsTrigger
            value="salary"
            className="h-7 rounded-b-none border-t-2 border-transparent px-2 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Salary Structure
          </TabsTrigger>
          <TabsTrigger
            value="leave"
            className="h-7 rounded-b-none border-t-2 border-transparent px-2 text-sm font-medium data-[state=active]:border-amber-500 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-700 data-[state=active]:shadow-none dark:data-[state=active]:text-amber-300"
          >
            <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
            Leave Policy
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TabsContent value="salary" className="mt-0 h-full overflow-y-auto">
          <SalaryTab key={employee.id} employee={employee} />
        </TabsContent>
        <TabsContent value="leave" className="mt-0 h-full overflow-y-auto">
          <LeaveTab key={employee.id} employee={employee} attendancePolicies={attendancePolicies} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// ── Assignment row (Holiday Calendar only — policy dropdown moved to LeaveTab) ─

function AssignmentRow({
  employee,
}: {
  employee: EmployeeRow;
  attendancePolicies: AttendancePolicy[];
}) {
  const qc = useQueryClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (vals: {
      attendance_settings_id: string | null;
      holiday_calendar_year: number | null;
    }) =>
      updateEmployeePayrollAssignments({
        data: {
          employee_id: employee.id,
          attendance_settings_id: vals.attendance_settings_id,
          holiday_calendar_year: vals.holiday_calendar_year,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "setup-overview"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const save = (patch: {
    attendance_settings_id?: string | null;
    holiday_calendar_year?: number | null;
  }) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      mutation.mutate({
        attendance_settings_id:
          patch.attendance_settings_id !== undefined
            ? patch.attendance_settings_id
            : employee.attendance_settings_id,
        holiday_calendar_year:
          patch.holiday_calendar_year !== undefined
            ? patch.holiday_calendar_year
            : employee.holiday_calendar_year,
      });
    }, 600);
  };

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Holiday Calendar</Label>
        <Input
          type="number"
          className="h-7 w-20 text-xs"
          placeholder={String(currentYear)}
          value={employee.holiday_calendar_year ?? ""}
          onChange={(e) =>
            save({ holiday_calendar_year: e.target.value ? Number(e.target.value) : null })
          }
        />
      </div>
    </div>
  );
}

// ── Salary Structure tab (inline, auto-save) ──────────────────────────────────

function SalaryTab({ employee }: { employee: EmployeeRow }) {
  const qc = useQueryClient();
  const { data: current } = useQuery(salaryStructureQuery(employee.id));

  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isFirstMount = useRef(true);

  const { register, control, watch, setValue, reset } = useForm<SalaryFormValues>({
    resolver: zodResolver(salarySchema),
    defaultValues: salaryDefaults(current),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "other_components" });

  useEffect(() => {
    reset(salaryDefaults(current));
    isFirstMount.current = true;
  }, [current, reset]);

  const values = watch();
  const basic = Number(values.basic_monthly || 0);
  const hra = Number(values.hra_monthly || 0);
  const ta = Number(values.ta_monthly || 0);
  const otherEarnings = (values.other_components ?? [])
    .filter((c) => c.type === "earning")
    .reduce((s, c) => s + Number(c.amount || 0), 0);
  const ctc = basic + hra + ta + otherEarnings;

  const mutation = useMutation({
    mutationFn: (v: SalaryFormValues) =>
      upsertSalaryStructure({
        data: {
          employee_id: employee.id,
          effective_from: v.effective_from,
          effective_to: v.effective_to || null,
          basic_monthly: v.basic_monthly,
          hra_monthly: v.hra_monthly,
          ta_monthly: v.ta_monthly,
          other_components: v.other_components,
          pf_applicable: v.pf_applicable,
          pt_applicable: v.pt_applicable,
          tds_monthly: v.tds_monthly,
          ctc_monthly: ctc,
          notes: v.notes || null,
        },
      }),
    onMutate: () => setSaving(true),
    onSuccess: () => {
      setSaving(false);
      setSavedOnce(true);
      qc.invalidateQueries({ queryKey: ["payroll", "structure", employee.id] });
      qc.invalidateQueries({ queryKey: ["payroll", "setup-overview"] });
    },
    onError: (e: Error) => {
      setSaving(false);
      toast.error(e.message);
    },
  });

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const result = salarySchema.safeParse(values);
      if (result.success) mutation.mutate(result.data);
    }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)]);

  const statusText = saving ? "Saving…" : savedOnce || current ? "Auto-saved" : "";

  return (
    <div className="p-5 space-y-5 max-w-xl">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Salary Structure</p>
        <span className="text-xs text-muted-foreground">{statusText}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Effective From *</Label>
          <Input type="date" {...register("effective_from")} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Effective To</Label>
          <Input type="date" {...register("effective_to")} className="h-8" />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Fixed Components
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(["basic_monthly", "hra_monthly", "ta_monthly"] as const).map((f, i) => (
            <div key={f} className="space-y-1">
              <Label className="text-xs">{["Basic", "HRA", "TA"][i]} (₹/mo)</Label>
              <Input type="number" min={0} step={0.01} className="h-8" {...register(f)} />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Other Components
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => append({ name: "", amount: 0, type: "earning" })}
          >
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {fields.map((field, idx) => (
          <div key={field.id} className="grid grid-cols-[1fr_90px_100px_28px] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="e.g. Special Allowance"
                className="h-8"
                {...register(`other_components.${idx}.name`)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (₹)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                className="h-8"
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
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="earning">Earning</SelectItem>
                  <SelectItem value="deduction">Deduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-7"
              onClick={() => remove(idx)}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
        {fields.length === 0 && (
          <p className="text-xs text-muted-foreground py-1">No custom components.</p>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Statutory Deductions
        </p>
        <div className="flex flex-wrap gap-5">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`pf-${employee.id}`}
              checked={watch("pf_applicable")}
              onCheckedChange={(v) => setValue("pf_applicable", !!v)}
            />
            <Label htmlFor={`pf-${employee.id}`} className="text-xs">
              PF applicable (12% of Basic)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`pt-${employee.id}`}
              checked={watch("pt_applicable")}
              onCheckedChange={(v) => setValue("pt_applicable", !!v)}
            />
            <Label htmlFor={`pt-${employee.id}`} className="text-xs">
              PT applicable (slab-based)
            </Label>
          </div>
        </div>
        <div className="w-40 space-y-1">
          <Label className="text-xs">TDS (₹/mo)</Label>
          <Input type="number" min={0} step={0.01} className="h-8" {...register("tds_monthly")} />
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
        <span className="text-sm font-medium">CTC (Monthly)</span>
        <span className="text-lg font-semibold tabular-nums">
          ₹{ctc.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        </span>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Input placeholder="Optional notes" className="h-8" {...register("notes")} />
      </div>
    </div>
  );
}

// ── Leave Policy tab (auto-save) ──────────────────────────────────────────────

function LeaveTab({
  employee,
  attendancePolicies,
}: {
  employee: EmployeeRow;
  attendancePolicies: AttendancePolicy[];
}) {
  const qc = useQueryClient();
  const { data: policy } = useQuery(leavePolicyQuery(employee.id, currentYear));
  const { data: balances = [] } = useQuery(leaveBalancesQuery(employee.id, currentYear));

  const [form, setForm] = useState<LeaveForm>(() => buildLeaveForm(null));
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setForm(buildLeaveForm(policy ?? null));
  }, [policy, employee.id]);

  // ── Policy dropdown save ──────────────────────────────────────────────────
  const policyDropdownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const assignmentMutation = useMutation({
    mutationFn: (settingsId: string | null) =>
      updateEmployeePayrollAssignments({
        data: {
          employee_id: employee.id,
          attendance_settings_id: settingsId,
          holiday_calendar_year: employee.holiday_calendar_year,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "setup-overview"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const handlePolicyChange = (selectedId: string) => {
    const settingsId = selectedId || null;

    // Auto-fill leave quotas from the selected policy
    const selectedPolicy = attendancePolicies.find((p) => p.id === selectedId) as any;
    if (selectedPolicy) {
      const next: LeaveForm = {
        cl_quota: selectedPolicy.cl_quota ?? form.cl_quota,
        sl_quota: selectedPolicy.sl_quota ?? form.sl_quota,
        el_quota: selectedPolicy.el_quota ?? form.el_quota,
        cl_carry_forward_max: selectedPolicy.cl_carry_forward_max ?? form.cl_carry_forward_max,
        sl_carry_forward_max: selectedPolicy.sl_carry_forward_max ?? form.sl_carry_forward_max,
        el_carry_forward_max: selectedPolicy.el_carry_forward_max ?? form.el_carry_forward_max,
        cl_opening_balance: selectedPolicy.cl_opening_balance ?? form.cl_opening_balance,
        sl_opening_balance: selectedPolicy.sl_opening_balance ?? form.sl_opening_balance,
        el_opening_balance: selectedPolicy.el_opening_balance ?? form.el_opening_balance,
      };
      setForm(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveMutation.mutate(next), 800);
    }

    clearTimeout(policyDropdownTimer.current);
    policyDropdownTimer.current = setTimeout(() => assignmentMutation.mutate(settingsId), 600);
  };

  // ── Leave quota save ──────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (values: LeaveForm) =>
      upsertLeavePolicy({
        data: { employee_id: employee.id, policy_year: currentYear, ...values },
      }),
    onMutate: () => setSaving(true),
    onSuccess: () => {
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["payroll", "leave-policy", employee.id, currentYear] });
      qc.invalidateQueries({ queryKey: ["payroll", "leave-balances", employee.id, currentYear] });
      qc.invalidateQueries({ queryKey: ["payroll", "setup-overview"] });
    },
    onError: (e: Error) => {
      setSaving(false);
      toast.error(e.message);
    },
  });

  const setField = <K extends keyof LeaveForm>(key: K, value: LeaveForm[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMutation.mutate(next), 800);
  };

  const balanceMap = Object.fromEntries(balances.map((b) => [b.leave_category, b]));

  const policyLabel = (p: AttendancePolicy) =>
    p.name ?? `${p.standard_start_time.slice(0, 5)}–${p.standard_end_time.slice(0, 5)}`;

  return (
    <div className="p-5 space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Leave Policy ({currentYear})</p>
        <span className="text-xs text-muted-foreground">
          {saving ? "Saving…" : policy ? "Auto-saved" : "Not configured yet"}
        </span>
      </div>

      <Separator />

      {/* Leave Policy template picker */}
      <LeaveSection label="Leave Policy">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Select a policy to auto-fill quotas (you can still override individual fields below)
          </Label>
          <select
            className="w-full h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={employee.attendance_settings_id ?? ""}
            onChange={(e) => handlePolicyChange(e.target.value)}
          >
            <option value="">— No policy selected —</option>
            {attendancePolicies.map((p) => (
              <option key={p.id} value={p.id}>
                {policyLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </LeaveSection>

      <Separator />

      <LeaveSection label="Annual Quotas (days)">
        <QuotaGrid
          cats={["cl", "sl", "el"]}
          getVal={(cat) => form[`${cat}_quota` as keyof LeaveForm]}
          setVal={(cat, v) => setField(`${cat}_quota` as keyof LeaveForm, v)}
        />
      </LeaveSection>

      <LeaveSection label="Max Carry-Forward (days)">
        <QuotaGrid
          cats={["cl", "sl", "el"]}
          getVal={(cat) => form[`${cat}_carry_forward_max` as keyof LeaveForm]}
          setVal={(cat, v) => setField(`${cat}_carry_forward_max` as keyof LeaveForm, v)}
        />
      </LeaveSection>

      <LeaveSection label="Opening Balances (days)">
        <QuotaGrid
          cats={["cl", "sl", "el"]}
          getVal={(cat) => form[`${cat}_opening_balance` as keyof LeaveForm]}
          setVal={(cat, v) => setField(`${cat}_opening_balance` as keyof LeaveForm, v)}
        />
      </LeaveSection>

      {balances.length > 0 && (
        <LeaveSection label="Current Balances">
          <div className="grid grid-cols-3 gap-2">
            {(["cl", "sl", "el"] as const).map((cat) => {
              const b = balanceMap[cat];
              if (!b) return null;
              return (
                <div key={cat} className="rounded-md border p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">{cat}</p>
                  <p className="text-lg font-semibold tabular-nums">{b.closing_balance ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {b.opening_balance}+{b.accrued}−{b.consumed}
                  </p>
                </div>
              );
            })}
          </div>
        </LeaveSection>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function LeaveSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function QuotaGrid({
  cats,
  getVal,
  setVal,
}: {
  cats: string[];
  getVal: (cat: string) => number;
  setVal: (cat: string, v: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {cats.map((cat) => (
        <div key={cat} className="space-y-1">
          <Label className="text-xs">{cat.toUpperCase()}</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            className="h-8"
            value={getVal(cat)}
            onChange={(e) => setVal(cat, Number(e.target.value) || 0)}
          />
        </div>
      ))}
    </div>
  );
}
