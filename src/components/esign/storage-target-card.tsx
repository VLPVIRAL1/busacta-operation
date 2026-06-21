import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, FolderKanban, User, Users, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/shared/utils";
import { formatPickerLabel } from "@/components/shared/entity-code";

export type StorageTargetKind = "direct_client" | "cpa" | "hr";
export type StorageTarget = {
  kind: StorageTargetKind;
  direct_client_id?: string | null;
  profile_id?: string | null;
  task_id?: string | null;
  organizer_deployment_id?: string | null;
};

export function StorageTargetCard({
  firmId,
  projectId,
  onProjectIdChange,
  value,
  onChange,
  resolvedPath,
}: {
  firmId: string | null;
  projectId: string | null;
  onProjectIdChange: (id: string | null) => void;
  value: StorageTarget | null;
  onChange: (v: StorageTarget) => void;
  resolvedPath?: string | null;
}) {
  const kind: StorageTargetKind = value?.kind ?? "cpa";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Storage & Routing Target</div>
          <div className="text-xs text-slate-500">
            Choose where this document's sealed files, tracking history, and field outputs land once
            executed. Required before continuing.
          </div>
        </div>
      </div>

      <KindTabs kind={kind} onChange={(k) => onChange({ ...(value ?? {}), kind: k })} />

      {kind === "direct_client" && (
        <DirectClientPicker
          value={value?.direct_client_id ?? null}
          onChange={(id) => onChange({ kind: "direct_client", direct_client_id: id })}
        />
      )}

      {kind === "cpa" && (
        <CpaTreePicker
          firmId={firmId}
          projectId={projectId}
          onProjectIdChange={onProjectIdChange}
          taskId={value?.task_id ?? null}
          onTaskIdChange={(id) =>
            onChange({
              kind: "cpa",
              task_id: id,
            })
          }
        />
      )}

      {kind === "hr" && (
        <HrPicker
          value={value?.profile_id ?? null}
          onChange={(id) => onChange({ kind: "hr", profile_id: id })}
        />
      )}

      {resolvedPath && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Resolved</span>
          <span className="font-mono">{resolvedPath}</span>
        </div>
      )}
    </div>
  );
}

function KindTabs({
  kind,
  onChange,
}: {
  kind: StorageTargetKind;
  onChange: (k: StorageTargetKind) => void;
}) {
  const opts: Array<{ k: StorageTargetKind; label: string; icon: typeof User; hint: string }> = [
    { k: "direct_client", label: "B2C Client", icon: User, hint: "Retail B2C profile" },
    { k: "cpa", label: "CPA Operations", icon: FolderKanban, hint: "Firm › Project › Task" },
    { k: "hr", label: "HR / Onboarding", icon: Users, hint: "Employee or applicant" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map((o) => {
        const active = kind === o.k;
        const Icon = o.icon;
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => onChange(o.k)}
            className={cn(
              "rounded-md border p-2.5 text-left transition-colors",
              active
                ? "border-primary bg-primary/5 text-primary"
                : "border-slate-200 bg-white hover:border-slate-300 text-slate-700",
            )}
          >
            <div className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-sm font-medium">{o.label}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{o.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

function DirectClientPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const q = useQuery({
    queryKey: ["esign", "direct_clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_clients")
        .select("id, display_name, email, identifier")
        .order("display_name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">B2C client</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="bg-white">
          <SelectValue placeholder="Pick a B2C client" />
        </SelectTrigger>
        <SelectContent>
          {(q.data ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {formatPickerLabel(c.identifier, c.display_name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CpaTreePicker({
  firmId,
  projectId,
  onProjectIdChange,
  taskId,
  onTaskIdChange,
}: {
  firmId: string | null;
  projectId: string | null;
  onProjectIdChange: (id: string | null) => void;
  taskId: string | null;
  onTaskIdChange: (id: string | null) => void;
}) {
  const projectsQ = useQuery({
    queryKey: ["esign", "cpa-projects", firmId],
    enabled: !!firmId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, code")
        .eq("firm_id", firmId!)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const tasksQ = useQuery({
    queryKey: ["esign", "cpa-tasks", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1">
          <Building2 className="h-3 w-3" /> Project
        </Label>
        <Select
          value={projectId ?? ""}
          onValueChange={(v) => {
            onProjectIdChange(v || null);
            onTaskIdChange(null);
          }}
          disabled={!firmId}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder={firmId ? "Pick a project" : "Pick a firm first"} />
          </SelectTrigger>
          <SelectContent>
            {(projectsQ.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {formatPickerLabel((p as { code?: string | null }).code, p.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1">
          <ChevronRight className="h-3 w-3" /> Task (optional)
        </Label>
        <Select
          value={taskId ?? "__none__"}
          onValueChange={(v) => onTaskIdChange(v === "__none__" ? null : v)}
          disabled={!projectId}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder={projectId ? "No task" : "Pick a project first"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No task</SelectItem>
            {(tasksQ.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function HrPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const q = useQuery({
    queryKey: ["esign", "hr-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Employee / applicant</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="bg-white">
          <SelectValue placeholder="Pick a profile" />
        </SelectTrigger>
        <SelectContent>
          {(q.data ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name ?? p.email ?? p.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function isStorageTargetValid(t: StorageTarget | null): boolean {
  if (!t) return false;
  if (t.kind === "direct_client") return !!t.direct_client_id;
  if (t.kind === "cpa") return true; // requires project_id at envelope-level which is validated separately
  if (t.kind === "hr") return !!t.profile_id;
  return false;
}

export function StorageTargetChip({ target }: { target: StorageTarget | null }) {
  const label = useMemo(() => {
    if (!target?.kind) return "No target";
    if (target.kind === "direct_client") return "B2C Client";
    if (target.kind === "cpa") return "CPA Ops";
    return "HR / Onboarding";
  }, [target]);
  return (
    <Badge variant="outline" className="text-[11px] gap-1">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
      Target · {label}
    </Badge>
  );
}
