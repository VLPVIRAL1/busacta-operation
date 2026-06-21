import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineDatePopover } from "@/components/shared/inline-date-popover";
import { formatPickerLabel } from "@/components/shared/entity-code";
import { PeoplePicker } from "@/components/shared/people-picker";
import {
  updateTaskField,
  replaceTaskPeople,
  projectPipelineStagesAllQuery,
  taskInfoQuery,
  type TaskInfoRow,
} from "@/lib/queries/ops.queries";
import {
  TASK_PRIORITY_OPTIONS,
  TASK_COMPLEXITY_OPTIONS,
  type TaskPriority,
} from "@/lib/shared/domain";
import { PriorityIcon, ComplexityIcon } from "@/lib/ui/task-option-icons";

/**
 * Dense inline-editable Task Information form used in Tab 5 of the To-Do
 * split-pane. Mutations go through `updateTaskField` / `replaceTaskPeople`
 * so the Task View and the To-Do row both invalidate in sync.
 */
export function TaskInformationForm({ taskId }: { taskId: string }) {
  const qc = useQueryClient();

  const { data: task, isLoading } = useQuery(taskInfoQuery(taskId));

  const { data: allStages = [] } = useQuery(projectPipelineStagesAllQuery());

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["task-info", taskId] });
    qc.invalidateQueries({ queryKey: ["task", taskId] });
    qc.invalidateQueries({ queryKey: ["task-full", taskId] });
    qc.invalidateQueries({ queryKey: ["task-edit", taskId] });
    qc.invalidateQueries({ queryKey: ["todos"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const mField = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateTaskField(taskId, patch),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const mPeople = useMutation({
    mutationFn: (input: { role: "assignee" | "reviewer"; userIds: string[] }) =>
      replaceTaskPeople({ taskId, role: input.role, userIds: input.userIds }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  // Local editable buffer for text inputs that commit on blur.
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");
  const [taxYear, setTaxYear] = useState("");
  useEffect(() => {
    if (!task) return;
    setTitle(task.title ?? "");
    setPeriod(task.period ?? "");
    setTaxYear(task.tax_year != null ? String(task.tax_year) : "");
  }, [task]);

  const assigneeIds = useMemo(
    () => (task?.task_assignees ?? []).filter((p) => p.role === "assignee").map((p) => p.user_id),
    [task],
  );
  const reviewerIds = useMemo(
    () => (task?.task_assignees ?? []).filter((p) => p.role === "reviewer").map((p) => p.user_id),
    [task],
  );

  const stagesForProject = useMemo(
    () =>
      allStages
        .filter((s) => s.project_id === task?.project_id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [allStages, task?.project_id],
  );

  if (isLoading || !task) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const firmName = task.client_entities?.projects?.firms?.name ?? "—";
  const firmCode = task.client_entities?.projects?.firms?.firm_identifier ?? null;
  const projectName = task.client_entities?.projects?.name ?? "—";
  const projectCode = task.client_entities?.projects?.code ?? null;
  const clientName = task.client_entities?.name ?? "—";
  const pending = mField.isPending || mPeople.isPending;

  return (
    <div className="space-y-4">
      {pending && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </div>
      )}
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        <Field label="Task ID">
          <Badge variant="outline" className="font-mono">
            {task.display_id ?? task.id.slice(0, 8)}
          </Badge>
        </Field>

        <Field label="Task Name">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const next = title.trim();
              if (next && next !== (task.title ?? "")) mField.mutate({ title: next });
            }}
            className="h-8 text-xs"
          />
        </Field>

        <Field label="Firm">
          <ReadonlyChip>{formatPickerLabel(firmCode, firmName)}</ReadonlyChip>
        </Field>

        <Field label="Project">
          <ReadonlyChip>{formatPickerLabel(projectCode, projectName)}</ReadonlyChip>
        </Field>

        <Field label="Client / Entity">
          <ReadonlyChip>{clientName}</ReadonlyChip>
        </Field>

        <Field label="Tax Year">
          <Input
            type="number"
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
            onBlur={() => {
              const n = taxYear === "" ? null : Number(taxYear);
              if (n !== (task.tax_year ?? null)) mField.mutate({ tax_year: n });
            }}
            className="h-8 text-xs"
          />
        </Field>

        <Field label="Period">
          <Input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            onBlur={() => {
              const next = period.trim() || null;
              if (next !== (task.period ?? null)) mField.mutate({ period: next });
            }}
            className="h-8 text-xs"
            placeholder="e.g. Q3 2025"
          />
        </Field>

        <Field label="Difficulty Level">
          <Select
            value={task.complexity || undefined}
            onValueChange={(v) => mField.mutate({ complexity: v })}
          >
            <SelectTrigger
              className="h-8 text-xs"
              aria-label={`Difficulty: ${task.complexity ?? "—"}`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {task.complexity ? (
                  <ComplexityIcon value={task.complexity} />
                ) : (
                  <span className="text-muted-foreground">Select…</span>
                )}
              </span>
            </SelectTrigger>
            <SelectContent>
              {TASK_COMPLEXITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex items-center gap-1.5">
                    <ComplexityIcon value={o.value} />
                    {o.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Urgency / Priority">
          <Select
            value={(task.priority as TaskPriority) || undefined}
            onValueChange={(v) => mField.mutate({ priority: v })}
          >
            <SelectTrigger className="h-8 text-xs" aria-label={`Priority: ${task.priority ?? "—"}`}>
              <span className="flex items-center gap-1.5 min-w-0">
                {task.priority ? (
                  <PriorityIcon value={task.priority} />
                ) : (
                  <span className="text-muted-foreground">Select…</span>
                )}
              </span>
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex items-center gap-1.5">
                    <PriorityIcon value={o.value} />
                    {o.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Start Date">
          <InlineDatePopover
            label="Start"
            value={task.start_date}
            onChange={(next) => mField.mutate({ start_date: next })}
          />
        </Field>

        <Field label="Due Date">
          <InlineDatePopover
            label="Due"
            value={task.due_date}
            onChange={(next) => mField.mutate({ due_date: next })}
          />
        </Field>

        <Field label="Completion Date">
          <InlineDatePopover
            label="Completed"
            value={task.completed_at}
            onChange={(next) => mField.mutate({ completed_at: next })}
          />
        </Field>

        <Field label="Stage">
          <Select
            value={task.pipeline_stage_id ?? undefined}
            onValueChange={(v) => mField.mutate({ pipeline_stage_id: v })}
            disabled={stagesForProject.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue
                placeholder={stagesForProject.length === 0 ? "No stages defined" : "Select stage…"}
              />
            </SelectTrigger>
            <SelectContent>
              {stagesForProject.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Stage Head">
          <ReadonlyChip>
            {(() => {
              const s = stagesForProject.find((x) => x.id === task.pipeline_stage_id);
              if (!s) return "—";
              const labelKey: Record<string, string> = {
                pre_start: "Not started",
                in_progress: "In progress",
                completed: "Completed",
                blocked: "Blocked",
              };
              return labelKey[s.primary_state] ?? s.primary_state;
            })()}
          </ReadonlyChip>
        </Field>

        <Field label="Assignees" wide>
          <PeoplePicker
            value={assigneeIds}
            onChange={(ids) => mPeople.mutate({ role: "assignee", userIds: ids })}
            placeholder="Pick assignees…"
          />
        </Field>

        <Field label="Reviewers" wide>
          <PeoplePicker
            value={reviewerIds}
            onChange={(ids) => mPeople.mutate({ role: "reviewer", userIds: ids })}
            placeholder="Pick reviewers…"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2 space-y-1" : "space-y-1"}>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function ReadonlyChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-8 px-2.5 rounded-md border bg-muted/30 text-xs flex items-center text-foreground/80 truncate">
      {children}
    </div>
  );
}
