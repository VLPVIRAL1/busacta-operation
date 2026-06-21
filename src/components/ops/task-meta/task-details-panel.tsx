import { CalendarRange, GitBranch, Users, UserCheck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineDatePopover } from "@/components/shared/inline-date-popover";
import { TaskTimerControl } from "@/components/ops/timer-widget";
import { TaskDraftEmailButton } from "@/components/ops/task-draft-email-button";
import { SOFTWARE_OPTIONS, labelFor } from "@/lib/shared/domain";
import {
  ProjectLevelPicker,
  AvatarPickerPopover,
  InlineYearEditor,
  TaskClientPicker,
} from "./task-field-controls";
import { useTaskMeta } from "./use-task-meta";

// Legacy pipeline stages — used only when a project hasn't defined custom stages.
const PIPELINE_STAGES = [
  { key: "handover_received", label: "Handover Received" },
  { key: "in_prep", label: "In-Prep" },
  { key: "internal_qc", label: "Internal QC" },
  { key: "waiting_cpa", label: "Waiting on B2B Firm" },
  { key: "ready_for_delivery", label: "Ready for Delivery" },
  { key: "final_signoff", label: "Final Sign-off" },
];
const LEGACY_STAGE_KEYS = new Set(PIPELINE_STAGES.map((s) => s.key));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Editable task "Details" surface — reuses the canonical Task View field controls
 * (dates, period, pipeline stage, client, assignees, reviewers, tax year,
 * difficulty, urgency) plus the timer and draft-email actions. Intentionally
 * omits Discussion, sub-task / action-item counts, and the Watch toggle.
 */
export function TaskDetailsPanel({ taskId }: { taskId: string }) {
  const {
    task,
    isLoading,
    firmId,
    projectStages,
    difficultyLevels,
    urgencyLevels,
    assigneeIds,
    reviewerIds,
    updateField,
    setAssignees,
  } = useTaskMeta(taskId);

  if (isLoading || !task) {
    return (
      <div className="space-y-2 p-1">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Actions + difficulty/urgency */}
      <div className="flex flex-wrap items-center gap-2">
        <TaskTimerControl taskId={taskId} />
        <TaskDraftEmailButton taskId={taskId} />
        <ProjectLevelPicker
          label="Difficulty"
          levels={difficultyLevels}
          value={task.difficulty_level_id}
          onChange={(v) => updateField.mutate({ difficulty_level_id: v })}
        />
        <ProjectLevelPicker
          label="Urgency"
          levels={urgencyLevels}
          value={task.urgency_level_id}
          onChange={(v) => updateField.mutate({ urgency_level_id: v })}
        />
      </div>

      <div className="divide-y rounded-lg border bg-card px-3">
        <Field label="Start">
          <InlineDatePopover
            label="Start"
            value={task.start_date}
            onChange={(v) => updateField.mutate({ start_date: v })}
            toneClass="border-teal-300/60 bg-teal-50/40 hover:bg-teal-50 dark:bg-teal-950/20"
          />
        </Field>

        <Field label="Due">
          <InlineDatePopover
            label="Due"
            value={task.due_date}
            onChange={(v) => updateField.mutate({ due_date: v })}
            toneClass="border-blue-300/60 bg-blue-50/40 hover:bg-blue-50 dark:bg-blue-950/20"
          />
        </Field>

        <Field label="Completed">
          <InlineDatePopover
            label="Completed"
            value={task.completed_at}
            onChange={(v) => updateField.mutate({ completed_at: v ? `${v}T00:00:00.000Z` : null })}
            toneClass="border-sky-300/60 bg-sky-50/40 hover:bg-sky-50 dark:bg-sky-950/20"
          />
        </Field>

        <Field label="Period">
          <Select
            value={task.period ?? "none"}
            onValueChange={(v) => updateField.mutate({ period: v === "none" ? null : v })}
          >
            <SelectTrigger className="relative h-7 w-36 pl-7 pr-7 text-xs">
              <CalendarRange
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Period —</SelectItem>
              <SelectItem value="Monthly">Monthly</SelectItem>
              <SelectItem value="Quarterly">Quarterly</SelectItem>
              <SelectItem value="Yearly">Yearly</SelectItem>
              <SelectItem value="Ad-hoc">Ad-hoc</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Pipeline Stage">
          {projectStages.length > 0 ? (
            <Select
              value={task.pipeline_stage_id ?? undefined}
              onValueChange={(v) => {
                const stage = projectStages.find((s) => s.id === v);
                const patch: Record<string, unknown> = { pipeline_stage_id: v };
                if (stage && LEGACY_STAGE_KEYS.has(stage.key)) patch.pipeline_stage = stage.key;
                updateField.mutate(patch);
              }}
            >
              <SelectTrigger className="relative h-7 w-52 pl-7 pr-7 text-xs">
                <GitBranch
                  className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <SelectValue placeholder="Pipeline stage" />
              </SelectTrigger>
              <SelectContent>
                {projectStages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={task.pipeline_stage ?? "handover_received"}
              onValueChange={(v) => updateField.mutate({ pipeline_stage: v })}
            >
              <SelectTrigger className="relative h-7 w-52 pl-7 pr-7 text-xs">
                <GitBranch
                  className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        {firmId && (
          <Field label="Client">
            <TaskClientPicker
              firmId={firmId}
              value={task.client_id}
              onChange={(v) => updateField.mutate({ client_id: v })}
            />
          </Field>
        )}

        <Field label="Assignees">
          <AvatarPickerPopover
            icon={<Users className="h-3 w-3" />}
            label="Assignees"
            ids={assigneeIds}
            onChange={(ids) => setAssignees.mutate({ ids, role: "assignee" })}
          />
        </Field>

        <Field label="Reviewers">
          <AvatarPickerPopover
            icon={<UserCheck className="h-3 w-3" />}
            label="Reviewers"
            ids={reviewerIds}
            onChange={(ids) => setAssignees.mutate({ ids, role: "reviewer" })}
          />
        </Field>

        <Field label="Tax Year">
          <InlineYearEditor
            value={task.tax_year}
            onSave={(v) => updateField.mutate({ tax_year: v })}
          />
        </Field>

        {task.software && (
          <Field label="Software">
            <Badge variant="outline" className="h-7 text-[11px]">
              {labelFor(SOFTWARE_OPTIONS, task.software)}
            </Badge>
          </Field>
        )}
      </div>
    </div>
  );
}
