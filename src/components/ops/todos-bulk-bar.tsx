import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiPersonPicker } from "@/components/shared/multi-person-picker";
import { cn } from "@/lib/shared/utils";
import {
  bulkUpdateTaskFields,
  bulkReplaceTaskPeople,
  type TodoRow,
  type PipelineStageRow,
} from "@/lib/queries/ops.queries";
import { TASK_PRIORITY_OPTIONS } from "@/lib/shared/domain";
import { PriorityIcon, ComplexityIcon } from "@/lib/ui/task-option-icons";

interface Props {
  selected: TodoRow[];
  onClear: () => void;
  onApplied: () => void;
  stagesByProject: Map<string, PipelineStageRow[]>;
}

const COMPLEXITY_OPTIONS = [
  { value: "a_hard", label: "A — Hard" },
  { value: "b_medium", label: "B — Medium" },
  { value: "c_easy", label: "C — Easy" },
];

export function TodosBulkBar({ selected, onClear, onApplied, stagesByProject }: Props) {
  const ids = useMemo(() => selected.map((r) => r.id), [selected]);
  const projectIds = useMemo(
    () =>
      Array.from(new Set(selected.map((r) => r.client_entities?.project_id ?? ""))).filter(Boolean),
    [selected],
  );
  const singleProjectStages =
    projectIds.length === 1 ? (stagesByProject.get(projectIds[0]) ?? []) : [];

  const mField = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => bulkUpdateTaskFields(ids, patch),
    onSuccess: (res) => {
      if (res.failed.length === 0)
        toast.success(`Updated ${res.ok} task${res.ok === 1 ? "" : "s"}`);
      else toast.warning(`Updated ${res.ok}/${ids.length} · ${res.failed.length} failed`);
      onApplied();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mPeople = useMutation({
    mutationFn: async (input: { role: "assignee" | "reviewer"; userIds: string[] }) =>
      bulkReplaceTaskPeople({ ids, role: input.role, userIds: input.userIds }),
    onSuccess: (res) => {
      if (res.failed.length === 0)
        toast.success(`Updated ${res.ok} task${res.ok === 1 ? "" : "s"}`);
      else toast.warning(`Updated ${res.ok}/${ids.length} · ${res.failed.length} failed`);
      onApplied();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = mField.isPending || mPeople.isPending;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 px-3 py-2 rounded-md border bg-primary text-primary-foreground shadow-sm">
      <span className="text-xs font-medium">{selected.length} selected</span>
      <div className="h-5 w-px bg-primary-foreground/30" />

      <BulkPopover
        label="Stage"
        disabled={projectIds.length !== 1}
        disabledHint="Select tasks from one project"
      >
        <BulkStage
          stages={singleProjectStages}
          onPick={(id) => mField.mutate({ pipeline_stage_id: id })}
        />
      </BulkPopover>

      <BulkPopover label="Due date">
        <BulkDate onPick={(iso) => mField.mutate({ due_date: iso })} />
      </BulkPopover>

      <BulkPopover label="Assignees">
        <BulkPeople
          role="assignee"
          onApply={(uids) => mPeople.mutate({ role: "assignee", userIds: uids })}
        />
      </BulkPopover>

      <BulkPopover label="Reviewers">
        <BulkPeople
          role="reviewer"
          onApply={(uids) => mPeople.mutate({ role: "reviewer", userIds: uids })}
        />
      </BulkPopover>

      <BulkEnum
        label="Urgency"
        options={TASK_PRIORITY_OPTIONS}
        renderIcon={(v) => <PriorityIcon value={v} />}
        onPick={(v) => mField.mutate({ priority: v })}
      />
      <BulkEnum
        label="Difficulty"
        options={COMPLEXITY_OPTIONS}
        renderIcon={(v) => <ComplexityIcon value={v} />}
        onPick={(v) => mField.mutate({ complexity: v })}
      />
      <BulkEnum
        label="Period"
        options={[
          { value: "Monthly", label: "Monthly" },
          { value: "Quarterly", label: "Quarterly" },
          { value: "Yearly", label: "Yearly" },
          { value: "Ad-hoc", label: "Ad-hoc" },
        ]}
        onPick={(v) => mField.mutate({ period: v })}
      />

      {pending && <Loader2 className="h-4 w-4 animate-spin" />}

      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-7 text-xs text-primary-foreground hover:bg-primary-foreground/10"
        onClick={onClear}
      >
        <X className="h-3 w-3 mr-1" /> Clear
      </Button>
    </div>
  );
}

function BulkPopover({
  label,
  children,
  disabled,
  disabledHint,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
          className="h-7 text-xs"
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function BulkStage({
  stages,
  onPick,
}: {
  stages: PipelineStageRow[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      {stages.length === 0 ? (
        <p className="text-xs text-muted-foreground p-2">No stages available.</p>
      ) : (
        stages.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-accent text-xs"
          >
            {s.label}
          </button>
        ))
      )}
    </div>
  );
}

function BulkDate({ onPick }: { onPick: (iso: string | null) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="space-y-2">
      <Input
        type="datetime-local"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-8 text-xs"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={!val}
          onClick={() => onPick(val ? new Date(val).toISOString() : null)}
        >
          Apply
        </Button>
        <Button size="sm" variant="outline" onClick={() => onPick(null)}>
          Clear due
        </Button>
      </div>
    </div>
  );
}

function BulkPeople({
  role,
  onApply,
}: {
  role: "assignee" | "reviewer";
  onApply: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  void role;
  return (
    <div className="space-y-2">
      <MultiPersonPicker values={ids} onChange={setIds} />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => onApply(ids)}>
          <Save className="h-3 w-3 mr-1" /> Replace on{" "}
          {ids.length === 0 ? "all (clear)" : `(${ids.length})`}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        This replaces existing {role}s on every selected task.
      </p>
    </div>
  );
}

function BulkEnum({
  label,
  options,
  onPick,
  renderIcon,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (v: string) => void;
  renderIcon?: (v: string) => React.ReactNode;
}) {
  return (
    <Select onValueChange={onPick}>
      <SelectTrigger
        className={cn("h-7 w-[120px] text-xs bg-secondary text-secondary-foreground border-0")}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex items-center gap-1.5">
              {renderIcon?.(o.value)}
              {o.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
