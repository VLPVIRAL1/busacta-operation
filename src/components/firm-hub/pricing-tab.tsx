import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Lock, Calendar, Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CurrencyPicker } from "@/components/shared/currency-picker";
import { supabase } from "@/integrations/supabase/client";

type PricingModel = "pay_per_task" | "effective_hours" | "fixed_person" | "tbd";

interface Period {
  id: string;
  project_id: string;
  label: string | null;
  model: PricingModel;
  starts_on: string;
  ends_on: string | null;
  currency: string | null;
  notes: string | null;
  created_at: string;
}

const MODEL_LABELS: Record<PricingModel, string> = {
  pay_per_task: "Pay-per-Task",
  effective_hours: "Effective Hours",
  fixed_person: "Fixed Person (Retainer)",
  tbd: "TBD",
};

const MODEL_DESCRIPTIONS: Record<PricingModel, string> = {
  pay_per_task: "Flat fee per task, billed when a billable stage is completed.",
  effective_hours: "Hourly rate × effective hours logged; bills on every time log.",
  fixed_person: "Monthly retainer per employee; auto-generated on cadence.",
  tbd: "Pricing not yet decided.",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function PricingPeriodsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);

  const { data: periods = [] } = useQuery({
    queryKey: ["fh-pricing-periods", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_pricing_periods")
        .select("*")
        .eq("project_id", projectId)
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Period[];
    },
  });

  // counts of billable events per period (to determine "locked")
  const { data: eventCounts = {} } = useQuery({
    queryKey: ["fh-pricing-event-counts", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("task_billable_events")
        .select("pricing_period_id")
        .eq("project_id", projectId);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of data ?? []) m[r.pricing_period_id] = (m[r.pricing_period_id] ?? 0) + 1;
      return m;
    },
  });

  const activePeriod = useMemo(() => {
    const t = today();
    return periods.find((p) => p.starts_on <= t && (!p.ends_on || p.ends_on >= t)) ?? null;
  }, [periods]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pricing Periods</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Date-bound, currency-frozen rate cards. End the current period before changing rates —
              never edit in place.
            </p>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Start new period
              </Button>
            </DialogTrigger>
            <NewPeriodDialog
              projectId={projectId}
              activePeriod={activePeriod}
              onClose={() => setNewOpen(false)}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground text-center">
              No pricing periods yet. Start one to begin billing this project.
            </div>
          ) : (
            <div className="space-y-3">
              {periods.map((p) => (
                <PeriodCard
                  key={p.id}
                  period={p}
                  projectId={projectId}
                  isActive={activePeriod?.id === p.id}
                  eventCount={eventCounts[p.id] ?? 0}
                  onChanged={() => {
                    qc.invalidateQueries({ queryKey: ["fh-pricing-periods", projectId] });
                    qc.invalidateQueries({ queryKey: ["fh-pricing-event-counts", projectId] });
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewPeriodDialog({
  projectId,
  activePeriod,
  onClose,
}: {
  projectId: string;
  activePeriod: Period | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [startsOn, setStartsOn] = useState(today());
  const [model, setModel] = useState<PricingModel>("pay_per_task");
  const [label, setLabel] = useState("");
  const [overrideCur, setOverrideCur] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [endActive, setEndActive] = useState(true);

  const save = useMutation({
    mutationFn: async () => {
      if (!startsOn) throw new Error("Start date required");
      // End active period the day before, if requested
      if (activePeriod && endActive) {
        const d = new Date(startsOn);
        d.setDate(d.getDate() - 1);
        const endDate = d.toISOString().slice(0, 10);
        if (endDate < activePeriod.starts_on)
          throw new Error("New period must start after the active period's start date.");
        const { error: endErr } = await (supabase as any)
          .from("project_pricing_periods")
          .update({ ends_on: endDate })
          .eq("id", activePeriod.id);
        if (endErr) throw endErr;
      }
      const payload: any = {
        project_id: projectId,
        starts_on: startsOn,
        model,
        label: label.trim() || null,
      };
      if (overrideCur) payload.currency = currency;
      const { error } = await (supabase as any).from("project_pricing_periods").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Period created");
      qc.invalidateQueries({ queryKey: ["fh-pricing-periods", projectId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Start new pricing period</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Label (optional)</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. FY26 Q1 rates"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start date *</Label>
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </div>
          <div>
            <Label>Pricing model *</Label>
            <Select value={model} onValueChange={(v) => setModel(v as PricingModel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pay_per_task">Pay-per-Task</SelectItem>
                <SelectItem value="effective_hours">Effective Hours</SelectItem>
                <SelectItem value="fixed_person">Fixed Person (Retainer)</SelectItem>
                <SelectItem value="tbd">TBD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">{MODEL_DESCRIPTIONS[model]}</p>
        <div className="flex items-center gap-2">
          <input
            id="ovc"
            type="checkbox"
            checked={overrideCur}
            onChange={(e) => setOverrideCur(e.target.checked)}
          />
          <Label htmlFor="ovc" className="cursor-pointer text-sm">
            Override currency (otherwise inherits from project/firm)
          </Label>
        </div>
        {overrideCur && (
          <CurrencyPicker value={currency} onChange={(v) => setCurrency(v ?? "USD")} />
        )}
        {activePeriod && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
            <div className="font-medium">An active period exists</div>
            <div className="text-muted-foreground">
              {activePeriod.label || MODEL_LABELS[activePeriod.model]} · started{" "}
              {activePeriod.starts_on}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="ea"
                type="checkbox"
                checked={endActive}
                onChange={(e) => setEndActive(e.target.checked)}
              />
              <Label htmlFor="ea" className="cursor-pointer">
                End active period the day before new period starts
              </Label>
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Create period
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PeriodCard({
  period,
  projectId,
  isActive,
  eventCount,
  onChanged,
}: {
  period: Period;
  projectId: string;
  isActive: boolean;
  eventCount: number;
  onChanged: () => void;
}) {
  const t = today();
  const isPast = !!period.ends_on && period.ends_on < t;
  const isFuture = period.starts_on > t;
  const isLocked = eventCount > 0; // rate matrix locked once events exist
  const [expanded, setExpanded] = useState(isActive);

  const endNow = useMutation({
    mutationFn: async () => {
      const d = new Date();
      d.setDate(d.getDate() - 0);
      const { error } = await (supabase as any)
        .from("project_pricing_periods")
        .update({ ends_on: d.toISOString().slice(0, 10) })
        .eq("id", period.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Period ended");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("project_pricing_periods")
        .delete()
        .eq("id", period.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Period removed");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={`rounded-lg border ${isActive ? "border-primary bg-primary/5" : "bg-card"}`}>
      <div className="flex items-center justify-between p-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{period.label || MODEL_LABELS[period.model]}</span>
          <Badge variant="outline" className="text-xs">
            {MODEL_LABELS[period.model]}
          </Badge>
          {isActive && <Badge className="text-xs">Active</Badge>}
          {isPast && (
            <Badge variant="secondary" className="text-xs">
              Past
            </Badge>
          )}
          {isFuture && (
            <Badge variant="outline" className="text-xs">
              Scheduled
            </Badge>
          )}
          {isLocked && (
            <Badge variant="outline" className="text-xs gap-1">
              <Lock className="h-3 w-3" /> {eventCount} event{eventCount === 1 ? "" : "s"} · rates
              frozen
            </Badge>
          )}
          {period.currency && (
            <Badge variant="outline" className="text-xs">
              {period.currency}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {period.starts_on} → {period.ends_on || "open"}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Collapse" : "View rates"}
          </Button>
          {isActive && !period.ends_on && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm("End this period today? It will become read-only.")) endNow.mutate();
              }}
            >
              End period
            </Button>
          )}
          {!isLocked && (
            <Button
              size="icon"
              variant="ghost"
              title="Delete period (no events recorded)"
              onClick={() => {
                if (confirm("Delete this period? It has no billable events.")) del.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t p-3">
          {(period.model === "pay_per_task" || period.model === "effective_hours") && (
            <MatrixEditor period={period} projectId={projectId} locked={isLocked || isPast} />
          )}
          {period.model === "fixed_person" && (
            <FixedAssignmentsEditor period={period} locked={isLocked || isPast} />
          )}
          {period.model === "tbd" && (
            <p className="text-xs text-muted-foreground">
              No rates configured. Switch to a billing model to define rates.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MatrixEditor({
  period,
  projectId,
  locked,
}: {
  period: Period;
  projectId: string;
  locked: boolean;
}) {
  const qc = useQueryClient();
  const isHourly = period.model === "effective_hours";

  const { data: returnTypes = [] } = useQuery({
    queryKey: ["fh-return-types", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_return_types")
        .select("id, code, label")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: difficulties = [] } = useQuery({
    queryKey: ["fh-difficulties", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_difficulty_levels")
        .select("id, key, label")
        .eq("project_id", projectId)
        .eq("enabled", true)
        .eq("is_archived", false)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["fh-matrix-rates", period.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_pricing_matrix_rates")
        .select("*")
        .eq("period_id", period.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rateMap = useMemo(() => {
    const m = new Map<string, { id: string; amount: number }>();
    for (const r of rates as any[])
      m.set(`${r.return_type_id}::${r.difficulty_level_id}`, {
        id: r.id,
        amount: Number(r.amount),
      });
    return m;
  }, [rates]);

  const upsert = useMutation({
    mutationFn: async ({ rt, df, amount }: { rt: string; df: string; amount: number }) => {
      const key = `${rt}::${df}`;
      const existing = rateMap.get(key);
      if (existing) {
        const { error } = await (supabase as any)
          .from("project_pricing_matrix_rates")
          .update({ amount })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("project_pricing_matrix_rates")
          .insert({ period_id: period.id, return_type_id: rt, difficulty_level_id: df, amount });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fh-matrix-rates", period.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (returnTypes.length === 0 || difficulties.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Set up return types and difficulty levels on the Workflow / Difficulty tabs before
        configuring rates.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {isHourly
            ? "Hourly rate per Return Type × Difficulty. Bills = effective hours × rate."
            : "Flat fee per Return Type × Difficulty. Fires when a billable stage is completed."}
        </div>
        {locked && (
          <Badge variant="outline" className="text-xs gap-1">
            <Lock className="h-3 w-3" />
            Read-only
          </Badge>
        )}
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Return Type</TableHead>
              {(difficulties as any[]).map((d) => (
                <TableHead key={d.id} className="text-right">
                  {d.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(returnTypes as any[]).map((rt) => (
              <TableRow key={rt.id}>
                <TableCell className="font-medium text-sm">
                  {rt.code} · {rt.label}
                </TableCell>
                {(difficulties as any[]).map((d) => {
                  const cell = rateMap.get(`${rt.id}::${d.id}`);
                  return (
                    <TableCell key={d.id} className="text-right">
                      <RateCell
                        amount={cell?.amount}
                        suffix={isHourly ? "/hr" : ""}
                        disabled={locked}
                        onSave={(amt) => upsert.mutate({ rt: rt.id, df: d.id, amount: amt })}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RateCell({
  amount,
  suffix,
  disabled,
  onSave,
}: {
  amount?: number;
  suffix?: string;
  disabled?: boolean;
  onSave: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(amount != null ? String(amount) : "");
  if (disabled) {
    return (
      <span className="tabular-nums text-sm">
        {amount != null ? amount.toFixed(2) : "—"}
        {suffix}
      </span>
    );
  }
  if (!editing) {
    return (
      <button
        className="hover:bg-muted/50 rounded px-2 py-1 tabular-nums text-sm w-full text-right"
        onClick={() => {
          setVal(amount != null ? String(amount) : "");
          setEditing(true);
        }}
      >
        {amount != null ? amount.toFixed(2) : <span className="text-muted-foreground">+ rate</span>}
        {suffix}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 justify-end">
      <Input
        autoFocus
        type="number"
        step="0.01"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = Number(val);
            if (!isNaN(n) && n >= 0) {
              onSave(n);
              setEditing(false);
            }
          }
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => {
          const n = Number(val);
          if (!isNaN(n) && n >= 0 && n !== amount) onSave(n);
          setEditing(false);
        }}
        className="h-7 w-20 text-right"
      />
    </div>
  );
}

function FixedAssignmentsEditor({ period, locked }: { period: Period; locked: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [flatAmount, setFlatAmount] = useState("0");
  const [cadence, setCadence] = useState<"mid_month" | "month_end" | "custom">("month_end");
  const [customDay, setCustomDay] = useState("15");

  const { data: employees = [] } = useQuery({
    queryKey: ["fh-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["fh-fixed-assignments", period.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_pricing_fixed_assignments")
        .select("*, profiles:employee_id(id, full_name, email)")
        .eq("period_id", period.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("Pick an employee");
      const amt = Number(flatAmount);
      if (isNaN(amt) || amt < 0) throw new Error("Amount must be ≥ 0");
      const payload: any = {
        period_id: period.id,
        employee_id: employeeId,
        flat_amount: amt,
        billing_cadence: cadence,
      };
      if (cadence === "custom") {
        const d = parseInt(customDay, 10);
        if (isNaN(d) || d < 1 || d > 31) throw new Error("Custom day 1-31");
        payload.custom_day = d;
      }
      const { error } = await (supabase as any)
        .from("project_pricing_fixed_assignments")
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment added");
      qc.invalidateQueries({ queryKey: ["fh-fixed-assignments", period.id] });
      setOpen(false);
      setEmployeeId("");
      setFlatAmount("0");
      setCadence("month_end");
      setCustomDay("15");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("project_pricing_fixed_assignments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fh-fixed-assignments", period.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Each row = one employee earns a fixed monthly retainer billed on the chosen cadence.
        </div>
        <div className="flex items-center gap-2">
          {locked && (
            <Badge variant="outline" className="text-xs gap-1">
              <Lock className="h-3 w-3" />
              Read-only
            </Badge>
          )}
          {!locked && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="mr-1 h-4 w-4" />
                  Add assignment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add fixed-person assignment</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Employee *</Label>
                    <Select value={employeeId} onValueChange={setEmployeeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {(employees as any[]).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.full_name || e.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Monthly retainer *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={flatAmount}
                        onChange={(e) => setFlatAmount(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Cadence</Label>
                      <Select value={cadence} onValueChange={(v) => setCadence(v as any)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mid_month">Mid-month (15th)</SelectItem>
                          <SelectItem value="month_end">Month-end</SelectItem>
                          <SelectItem value="custom">Custom day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {cadence === "custom" && (
                    <div>
                      <Label>Day of month (1-31)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={customDay}
                        onChange={(e) => setCustomDay(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={() => add.mutate()} disabled={add.isPending}>
                    Add
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      {(assignments as any[]).length === 0 ? (
        <div className="py-4 text-xs text-muted-foreground text-center">No assignments yet.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Retainer</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead>Last generated</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(assignments as any[]).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-sm">
                  {a.profiles?.full_name || a.profiles?.email || a.employee_id}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(a.flat_amount).toFixed(2)}
                </TableCell>
                <TableCell className="text-xs">
                  {a.billing_cadence === "custom"
                    ? `Day ${a.custom_day}`
                    : a.billing_cadence === "mid_month"
                      ? "Mid-month"
                      : "Month-end"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {a.last_generated_for || "—"}
                </TableCell>
                <TableCell className="text-right">
                  {!locked && (
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
