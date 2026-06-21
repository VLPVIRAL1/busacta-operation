/**
 * TaskTypesManager — global Direct-Client Task Category catalog.
 *
 * Source table: public.direct_client_task_types
 * Admins/super_admins can create/edit/toggle/sort categories that all
 * B2C Clients can use. The per-client price override is handled by
 * <ClientRateCard /> separately.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TaskType {
  id: string;
  code: string;
  label: string;
  default_pricing: number | null;
  active: boolean;
  sort_order: number;
}

export function TaskTypesManager() {
  const { roles } = useAuth();
  const canManage = roles.includes("admin") || roles.includes("super_admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [defaultPricing, setDefaultPricing] = useState("");

  const { data: types = [], isLoading } = useQuery<TaskType[]>({
    queryKey: ["direct-client-task-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_client_task_types")
        .select("id, code, label, default_pricing, active, sort_order")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaskType[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["direct-client-task-types"] });

  const create = useMutation({
    mutationFn: async () => {
      const codeNorm = code
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_");
      if (!codeNorm) throw new Error("Code is required");
      if (!label.trim()) throw new Error("Label is required");
      const price = defaultPricing.trim() ? Number(defaultPricing) : null;
      if (price !== null && (Number.isNaN(price) || price < 0)) throw new Error("Invalid price");
      const { error } = await supabase.from("direct_client_task_types").insert({
        code: codeNorm,
        label: label.trim(),
        default_pricing: price,
        sort_order: types.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category added");
      setOpen(false);
      setCode("");
      setLabel("");
      setDefaultPricing("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TaskType> }) => {
      const { error } = await supabase
        .from("direct_client_task_types")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => {
      toast.error(e.message);
      invalidate();
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("direct_client_task_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Task category catalog</CardTitle>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1 h-3.5 w-3.5" />
                New category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New task category</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Label *</Label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Tax Return — 1040"
                  />
                </div>
                <div>
                  <Label>Code *</Label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="tax_1040"
                    className="font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Lowercase, digits, underscores. Used as a stable key.
                  </p>
                </div>
                <div>
                  <Label>Default price (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={defaultPricing}
                    onChange={(e) => setDefaultPricing(e.target.value)}
                    placeholder="Leave blank to require per-client rate"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-5 text-sm text-muted-foreground">Loading…</div>
        ) : types.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground text-center">
            No task categories yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead className="w-[150px]">Code</TableHead>
                <TableHead className="w-[140px]">Default price</TableHead>
                <TableHead className="w-[90px] text-center">Active</TableHead>
                {canManage && <TableHead className="w-[60px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TaskTypeRow
                  key={t.id}
                  type={t}
                  canManage={canManage}
                  onSave={(patch) => update.mutate({ id: t.id, patch })}
                  onDelete={() => del.mutate(t.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TaskTypeRow({
  type,
  canManage,
  onSave,
  onDelete,
}: {
  type: TaskType;
  canManage: boolean;
  onSave: (patch: Partial<TaskType>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(type.label);
  const [price, setPrice] = useState(
    type.default_pricing != null ? String(type.default_pricing) : "",
  );
  return (
    <TableRow className={type.active ? "" : "opacity-60"}>
      <TableCell>
        <Input
          value={label}
          disabled={!canManage}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            if (label.trim() && label !== type.label) onSave({ label: label.trim() });
          }}
          className="h-8 text-sm"
        />
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{type.code}</TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={price}
          disabled={!canManage}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            const cur = type.default_pricing != null ? String(type.default_pricing) : "";
            if (price === cur) return;
            const v = price.trim() === "" ? null : Number(price);
            if (v !== null && (Number.isNaN(v) || v < 0)) {
              setPrice(cur);
              return;
            }
            onSave({ default_pricing: v });
          }}
          placeholder="—"
          className="h-8 text-sm"
        />
      </TableCell>
      <TableCell className="text-center">
        <Switch
          checked={type.active}
          disabled={!canManage}
          onCheckedChange={(v) => onSave({ active: v })}
        />
      </TableCell>
      {canManage && (
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            title="Delete category"
            onClick={() => {
              if (
                confirm(`Delete "${type.label}"? Existing tasks will keep their reference cleared.`)
              )
                onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
