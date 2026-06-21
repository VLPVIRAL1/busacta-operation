/**
 * ClientRateCard — per-client rate override editor.
 *
 * Direct stream: lists every active task category. Each row shows the
 * catalog's default price (faded) and a per-client override input. Saving
 * upserts into `direct_client_task_pricing`. Clearing the override deletes
 * the row so the default applies again. Billing mode (flat | hourly) is
 * editable per row.
 *
 * Firm stream: per-project pricing already lives inside the Project detail
 * view (`/clients/firm/$firmId/projects/$projectId`). This card just points
 * users there because firm-side pricing is per-project, not per-firm.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClientAdapter } from "@/lib/client-hub/adapter";

interface Props {
  adapter: ClientAdapter;
  scopeId: string;
}

interface TaskType {
  id: string;
  code: string;
  label: string;
  default_pricing: number | null;
  active: boolean;
}

interface Override {
  id: string;
  task_type_id: string;
  rate: number;
  billing_mode: "flat" | "hourly";
}

export function ClientRateCard({ adapter, scopeId }: Props) {
  if (adapter.pricing.mode !== "per-client-rate-card") {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Rate card</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Firm pricing is set per project. Open a project from the Projects tab to edit its rate
          card.
        </CardContent>
      </Card>
    );
  }
  return <DirectClientRateCard scopeId={scopeId} />;
}

function DirectClientRateCard({ scopeId }: { scopeId: string }) {
  const qc = useQueryClient();
  const typesQuery = useQuery<TaskType[]>({
    queryKey: ["direct-client-task-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_client_task_types")
        .select("id, code, label, default_pricing, active")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaskType[];
    },
  });

  const overridesQuery = useQuery<Override[]>({
    queryKey: ["direct-client-rate-overrides", scopeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_client_task_pricing")
        .select("id, task_type_id, rate, billing_mode")
        .eq("direct_client_id", scopeId);
      if (error) throw error;
      return (data ?? []) as Override[];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["direct-client-rate-overrides", scopeId] });

  const upsert = useMutation({
    mutationFn: async ({
      taskTypeId,
      rate,
      billingMode,
    }: {
      taskTypeId: string;
      rate: number;
      billingMode: "flat" | "hourly";
    }) => {
      const { error } = await supabase
        .from("direct_client_task_pricing")
        .upsert(
          { direct_client_id: scopeId, task_type_id: taskTypeId, rate, billing_mode: billingMode },
          { onConflict: "direct_client_id,task_type_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: async (overrideId: string) => {
      const { error } = await supabase
        .from("direct_client_task_pricing")
        .delete()
        .eq("id", overrideId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override removed — default applies");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const overrideMap = useMemo(() => {
    const m = new Map<string, Override>();
    for (const o of overridesQuery.data ?? []) m.set(o.task_type_id, o);
    return m;
  }, [overridesQuery.data]);

  const types = typesQuery.data ?? [];
  const loading = typesQuery.isLoading || overridesQuery.isLoading;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <DollarSign className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-sm">Per-client rate card</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-5 text-sm text-muted-foreground">Loading…</div>
        ) : types.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground text-center">
            No active task categories. Add one in the catalog above.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="w-[130px]">Default</TableHead>
                <TableHead className="w-[140px]">Override</TableHead>
                <TableHead className="w-[110px]">Billing</TableHead>
                <TableHead className="w-[130px]">Effective</TableHead>
                <TableHead className="w-[90px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <RateRow
                  key={t.id}
                  type={t}
                  override={overrideMap.get(t.id)}
                  onSave={(rate, mode) =>
                    upsert.mutate({ taskTypeId: t.id, rate, billingMode: mode })
                  }
                  onClear={(id) => remove.mutate(id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function fmt(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function RateRow({
  type,
  override,
  onSave,
  onClear,
}: {
  type: TaskType;
  override: Override | undefined;
  onSave: (rate: number, mode: "flat" | "hourly") => void;
  onClear: (id: string) => void;
}) {
  const [val, setVal] = useState<string>(override ? String(override.rate) : "");
  const [mode, setMode] = useState<"flat" | "hourly">(override?.billing_mode ?? "flat");

  const effective = override?.rate ?? type.default_pricing ?? null;
  const usingDefault = !override;

  const commit = () => {
    if (val.trim() === "") return;
    const n = Number(val);
    if (Number.isNaN(n) || n < 0) {
      setVal(override ? String(override.rate) : "");
      return;
    }
    if (override && n === override.rate && mode === override.billing_mode) return;
    onSave(n, mode);
  };

  return (
    <TableRow>
      <TableCell>
        <div className="text-sm font-medium">{type.label}</div>
        <div className="text-[11px] font-mono text-muted-foreground">{type.code}</div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{fmt(type.default_pricing)}</TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          placeholder="—"
          className="h-8 text-sm"
        />
      </TableCell>
      <TableCell>
        <Select
          value={mode}
          onValueChange={(v) => {
            const next = v as "flat" | "hourly";
            setMode(next);
            if (override && next !== override.billing_mode) {
              onSave(override.rate, next);
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flat">Flat</SelectItem>
            <SelectItem value="hourly">Hourly</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{fmt(effective)}</span>
          {usingDefault && effective != null && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              default
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {override && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onClear(override.id)}
          >
            Clear
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
