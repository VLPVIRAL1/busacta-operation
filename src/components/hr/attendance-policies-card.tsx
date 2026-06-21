import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { CalendarClock, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listLeavePolicyTemplates,
  upsertLeavePolicyTemplate,
  deleteLeavePolicyTemplate,
  toggleLeavePolicyActive,
} from "@/lib/hr/leave-policy-templates.functions";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { cn } from "@/lib/shared/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type LeavePolicy = {
  id: string;
  name: string | null;
  is_active: boolean;
  standard_start_time: string;
  standard_end_time: string;
  grace_period_minutes: number;
  early_checkout_grace_minutes: number;
  min_hours_full_day: number;
  min_hours_half_day: number;
  el_quota: number;
  cl_quota: number;
  sl_quota: number;
  el_carry_forward_max: number;
  cl_carry_forward_max: number;
  sl_carry_forward_max: number;
  opening_balance_date: string | null;
  el_opening_balance: number;
  cl_opening_balance: number;
  sl_opening_balance: number;
  leave_policy_assignments: { employee_id: string }[];
};

type PolicyForm = Omit<LeavePolicy, "id" | "leave_policy_assignments">;

const POLICY_DEFAULTS: PolicyForm = {
  name: "New Policy",
  is_active: true,
  standard_start_time: "09:00",
  standard_end_time: "18:00",
  grace_period_minutes: 15,
  early_checkout_grace_minutes: 0,
  min_hours_full_day: 8,
  min_hours_half_day: 4,
  el_quota: 15,
  cl_quota: 12,
  sl_quota: 6,
  el_carry_forward_max: 15,
  cl_carry_forward_max: 0,
  sl_carry_forward_max: 0,
  opening_balance_date: null,
  el_opening_balance: 0,
  cl_opening_balance: 0,
  sl_opening_balance: 0,
};

function normalizeTime(t: string | null | undefined) {
  if (!t) return "09:00";
  return t.slice(0, 5);
}

// ── Query ─────────────────────────────────────────────────────────────────────

const policiesQuery = queryOptions({
  queryKey: ["leave-policies"],
  queryFn: () => listLeavePolicyTemplates({ data: {} as any }),
  staleTime: 60_000,
});

// ── Main component ────────────────────────────────────────────────────────────

export function AttendancePoliciesCard() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data: policies = [], isLoading } = useQuery(policiesQuery);

  // Auto-select first policy on load
  useEffect(() => {
    if (!selected && (policies as LeavePolicy[]).length > 0) {
      setSelected((policies as LeavePolicy[])[0].id);
    }
  }, [policies, selected]);

  const selectedPolicy = (policies as LeavePolicy[]).find((p) => p.id === selected) ?? null;

  const leftPane = (
    <div className="h-full flex flex-col overflow-hidden border rounded-lg bg-background">
      <div className="shrink-0 px-3 py-2 border-b">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Leave Policies
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {isLoading && (
          <div className="space-y-1 px-1">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {!isLoading &&
          (policies as LeavePolicy[]).map((policy) => (
            <PolicyNavItem
              key={policy.id}
              policy={policy}
              active={selected === policy.id}
              onClick={() => setSelected(policy.id)}
            />
          ))}

        {!isLoading && (policies as LeavePolicy[]).length === 0 && (
          <p className="text-[11px] text-muted-foreground px-3 py-2">
            No policies yet. Create one below.
          </p>
        )}

        <NewPolicyButton onCreated={(id) => setSelected(id)} />
      </div>
    </div>
  );

  const rightPane = (
    <div className="h-full flex flex-col overflow-hidden border rounded-lg bg-background overflow-y-auto">
      {selectedPolicy ? (
        <UnifiedPolicyPanel
          key={selectedPolicy.id}
          policy={selectedPolicy}
          onDeleted={() => setSelected(null)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
          <CalendarClock className="h-8 w-8 opacity-30" />
          <p className="text-sm">Select a policy or create a new one.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col p-2">
      <div className="flex-1 min-h-0">
        <ResizableTwoPane
          storageKey="hr-attendance-policies"
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

// ── Policy nav item with active/inactive toggle ───────────────────────────────

function PolicyNavItem({
  policy,
  active,
  onClick,
}: {
  policy: LeavePolicy;
  active: boolean;
  onClick: () => void;
}) {
  const qc = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: () =>
      toggleLeavePolicyActive({ data: { id: policy.id, is_active: !policy.is_active } }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["leave-policies"] });
      const prev = qc.getQueryData(["leave-policies"]);
      qc.setQueryData(["leave-policies"], (old: any[]) =>
        (old ?? []).map((p: any) =>
          p.id === policy.id ? { ...p, is_active: !policy.is_active } : p,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["leave-policies"], ctx.prev);
      toast.error("Failed to update status");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["leave-policies"] }),
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center gap-2 px-3 py-2 rounded-md transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Users className="h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{policy.name ?? "Unnamed"}</p>
        <p className="text-[11px] opacity-70 truncate">
          {policy.leave_policy_assignments?.length ?? 0} staff
        </p>
      </div>
      <span
        onClick={(e) => {
          e.stopPropagation();
          toggleMutation.mutate();
        }}
        className={cn(
          "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border cursor-pointer transition-colors",
          policy.is_active
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
            : "bg-muted text-muted-foreground border-border hover:bg-accent",
        )}
      >
        {policy.is_active ? "Active" : "Inactive"}
      </span>
    </button>
  );
}

// ── New Policy button with inline name entry ──────────────────────────────────

function NewPolicyButton({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      upsertLeavePolicyTemplate({
        data: { ...POLICY_DEFAULTS, name: name.trim() },
      }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["leave-policies"] });
      setCreating(false);
      setName("");
      onCreated(data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!creating) {
    return (
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="text-sm">New Policy</span>
      </button>
    );
  }

  return (
    <div className="px-2 py-2 space-y-1.5">
      <Input
        autoFocus
        className="h-7 text-xs"
        placeholder="Policy name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) mutation.mutate();
          if (e.key === "Escape") {
            setCreating(false);
            setName("");
          }
        }}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 text-xs flex-1"
          disabled={!name.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Creating…" : "Create"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs"
          onClick={() => {
            setCreating(false);
            setName("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Unified Policy Panel ──────────────────────────────────────────────────────

function UnifiedPolicyPanel({ policy, onDeleted }: { policy: LeavePolicy; onDeleted: () => void }) {
  const qc = useQueryClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<PolicyForm>(() => ({
    name: policy.name ?? "",
    is_active: policy.is_active,
    standard_start_time: normalizeTime(policy.standard_start_time),
    standard_end_time: normalizeTime(policy.standard_end_time),
    grace_period_minutes: policy.grace_period_minutes ?? 15,
    early_checkout_grace_minutes: policy.early_checkout_grace_minutes ?? 0,
    min_hours_full_day: Number(policy.min_hours_full_day ?? 8),
    min_hours_half_day: Number(policy.min_hours_half_day ?? 4),
    el_quota: policy.el_quota ?? 15,
    cl_quota: policy.cl_quota ?? 12,
    sl_quota: policy.sl_quota ?? 6,
    el_carry_forward_max: policy.el_carry_forward_max ?? 15,
    cl_carry_forward_max: policy.cl_carry_forward_max ?? 0,
    sl_carry_forward_max: policy.sl_carry_forward_max ?? 0,
    opening_balance_date: policy.opening_balance_date ?? null,
    el_opening_balance: policy.el_opening_balance ?? 0,
    cl_opening_balance: policy.cl_opening_balance ?? 0,
    sl_opening_balance: policy.sl_opening_balance ?? 0,
  }));

  const saveMutation = useMutation({
    mutationFn: (f: PolicyForm) => upsertLeavePolicyTemplate({ data: { id: policy.id, ...f } }),
    onMutate: () => setSaving(true),
    onSuccess: () => {
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["leave-policies"] });
      qc.invalidateQueries({ queryKey: ["payroll", "setup-overview"] });
    },
    onError: (e: Error) => {
      setSaving(false);
      toast.error(e.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLeavePolicyTemplate({ data: { id: policy.id } }),
    onSuccess: () => {
      toast.success("Policy deleted");
      qc.invalidateQueries({ queryKey: ["leave-policies"] });
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setField = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMutation.mutate(next), 800);
  };

  const handleDelete = () => {
    const staffCount = policy.leave_policy_assignments?.length ?? 0;
    if (staffCount > 0) {
      if (
        !window.confirm(
          `This policy is assigned to ${staffCount} staff member(s). Deleting it will clear their policy assignment. Continue?`,
        )
      )
        return;
    }
    deleteMutation.mutate();
  };

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex-1">
          <Input
            className="text-base font-semibold border-0 border-b rounded-none px-0 h-auto py-0.5 focus-visible:ring-0"
            value={form.name ?? ""}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="Policy name"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{saving ? "Saving…" : "Auto-saved"}</span>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Separator />

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="attendance">
        <div className="px-5 pt-3">
          <TabsList className="h-8">
            <TabsTrigger value="attendance" className="text-xs h-7">
              Attendance Settings
            </TabsTrigger>
            <TabsTrigger value="leave" className="text-xs h-7">
              Leave Quotas
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Attendance Settings ──────────────────────────────────────── */}
        <TabsContent value="attendance" className="px-5 pb-5 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <PolicyField label="Standard start time" hint="On-time arrival baseline.">
              <Input
                type="time"
                value={form.standard_start_time}
                onChange={(e) => setField("standard_start_time", e.target.value)}
              />
            </PolicyField>
            <PolicyField label="Grace period (min)" hint="Late minutes allowed before flagging.">
              <Input
                type="number"
                min={0}
                max={240}
                value={form.grace_period_minutes}
                onChange={(e) => setField("grace_period_minutes", Number(e.target.value) || 0)}
              />
            </PolicyField>
            <PolicyField label="Standard end time" hint="Early checkout baseline.">
              <Input
                type="time"
                value={form.standard_end_time}
                onChange={(e) => setField("standard_end_time", e.target.value)}
              />
            </PolicyField>
            <PolicyField label="Early-checkout grace (min)" hint="Allowed early minutes.">
              <Input
                type="number"
                min={0}
                max={240}
                value={form.early_checkout_grace_minutes}
                onChange={(e) =>
                  setField("early_checkout_grace_minutes", Number(e.target.value) || 0)
                }
              />
            </PolicyField>
            <PolicyField label="Min hours — Full Day" hint="≥ this = Present.">
              <Input
                type="number"
                step="0.25"
                min={0}
                max={24}
                value={form.min_hours_full_day}
                onChange={(e) => setField("min_hours_full_day", Number(e.target.value) || 0)}
              />
            </PolicyField>
            <PolicyField label="Min hours — Half Day" hint="≥ this but below Full Day = Half-Day.">
              <Input
                type="number"
                step="0.25"
                min={0}
                max={24}
                value={form.min_hours_half_day}
                onChange={(e) => setField("min_hours_half_day", Number(e.target.value) || 0)}
              />
            </PolicyField>
          </div>
        </TabsContent>

        {/* ── Leave Quotas ─────────────────────────────────────────────── */}
        <TabsContent value="leave" className="px-5 pb-5 pt-4 space-y-4">
          <SubSection label="Annual Quotas (days)">
            <div className="grid grid-cols-3 gap-3">
              {(["el", "cl", "sl"] as const).map((cat) => (
                <div key={cat} className="space-y-1">
                  <Label className="text-xs">{cat.toUpperCase()}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    className="h-8"
                    value={form[`${cat}_quota`]}
                    onChange={(e) => setField(`${cat}_quota`, Number(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection label="Max Carry-Forward (days)">
            <div className="grid grid-cols-3 gap-3">
              {(["el", "cl", "sl"] as const).map((cat) => (
                <div key={cat} className="space-y-1">
                  <Label className="text-xs">{cat.toUpperCase()}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    className="h-8"
                    value={form[`${cat}_carry_forward_max`]}
                    onChange={(e) =>
                      setField(`${cat}_carry_forward_max`, Number(e.target.value) || 0)
                    }
                  />
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection label="Opening Balances">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Effective Date</Label>
                <Input
                  type="date"
                  className="h-8 w-40"
                  value={form.opening_balance_date ?? ""}
                  onChange={(e) => setField("opening_balance_date", e.target.value || null)}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(["el", "cl", "sl"] as const).map((cat) => (
                  <div key={cat} className="space-y-1">
                    <Label className="text-xs">{cat.toUpperCase()} (days)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      className="h-8"
                      value={form[`${cat}_opening_balance`]}
                      onChange={(e) =>
                        setField(`${cat}_opening_balance`, Number(e.target.value) || 0)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </SubSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function SubSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function PolicyField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
