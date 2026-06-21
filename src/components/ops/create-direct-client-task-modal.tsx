import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiPersonPicker } from "@/components/shared/multi-person-picker";
import { directClientTaskTypesQuery } from "@/lib/queries/direct-clients.queries";
import { createDirectClientTask, type WorkItemComplexity } from "@/lib/queries/ops.queries";
import { TASK_PRIORITY_OPTIONS } from "@/lib/shared/domain";
import { PriorityIcon, ComplexityIcon } from "@/lib/ui/task-option-icons";

const COMPLEXITY_OPTIONS: { value: WorkItemComplexity; label: string }[] = [
  { value: "a_hard", label: "A — Hard" },
  { value: "b_medium", label: "B — Medium" },
  { value: "c_easy", label: "C — Easy" },
];

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateDirectClientTaskModal({
  open,
  onOpenChange,
  directClientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directClientId: string;
  onCreated?: (taskId: string) => void;
}) {
  const qc = useQueryClient();
  const { data: taskTypes = [] } = useQuery({ ...directClientTaskTypesQuery(), enabled: open });

  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [taskTypeId, setTaskTypeId] = useState<string>("none");
  const [priority, setPriority] = useState("medium");
  const [complexity, setComplexity] = useState<WorkItemComplexity>("b_medium");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const due = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    setTitle("");
    setTitleTouched(false);
    setTaskTypeId("none");
    setPriority("medium");
    setComplexity("b_medium");
    setAssignees([]);
    setReviewers([]);
    setStartDate(toLocalInput(now));
    setDueDate(toLocalInput(due));
    setDueTouched(false);
  }, [open]);

  function handleStartChange(v: string) {
    setStartDate(v);
    if (!dueTouched && v) {
      const d = new Date(v);
      d.setHours(d.getHours() + 48);
      setDueDate(toLocalInput(d));
    }
  }

  const submit = useMutation({
    mutationFn: () =>
      createDirectClientTask({
        directClientId,
        taskTypeId: taskTypeId === "none" ? (taskTypes[0]?.id ?? "") : taskTypeId,
        title: title.trim(),
        priority,
        complexity,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        assigneeIds: assignees,
        reviewerIds: reviewers,
      }),
    onSuccess: ({ taskId }) => {
      toast.success("Task created");
      qc.invalidateQueries({ queryKey: ["direct-clients", "tasks", directClientId] });
      qc.invalidateQueries({ queryKey: ["todos"] });
      onOpenChange(false);
      onCreated?.(taskId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    title.trim().length > 0 && (taskTypeId !== "none" || taskTypes.length > 0) && !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label>
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder="Task title…"
              autoFocus
            />
            {titleTouched && !title.trim() && (
              <p className="text-xs text-destructive">Title is required.</p>
            )}
          </div>

          {/* Task type (= project type for B2C clients) */}
          <div className="space-y-1.5">
            <Label>
              Task Type <span className="text-destructive">*</span>
            </Label>
            <Select value={taskTypeId} onValueChange={setTaskTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select task type…" />
              </SelectTrigger>
              <SelectContent>
                {taskTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority + Complexity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-1.5">
                        <PriorityIcon priority={o.value} className="h-3.5 w-3.5" />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Complexity</Label>
              <Select
                value={complexity}
                onValueChange={(v) => setComplexity(v as WorkItemComplexity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-1.5">
                        <ComplexityIcon complexity={o.value} className="h-3.5 w-3.5" />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => handleStartChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due</Label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  setDueTouched(true);
                }}
              />
            </div>
          </div>

          {/* Assignees */}
          <div className="space-y-1.5">
            <Label>Assignees</Label>
            <MultiPersonPicker
              values={assignees}
              onChange={setAssignees}
              placeholder="Add assignees…"
            />
          </div>

          {/* Reviewers */}
          <div className="space-y-1.5">
            <Label>Reviewers</Label>
            <MultiPersonPicker
              values={reviewers}
              onChange={setReviewers}
              placeholder="Add reviewers…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTitleTouched(true);
              if (canSubmit) submit.mutate();
            }}
            disabled={!canSubmit}
          >
            {submit.isPending ? "Creating…" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
