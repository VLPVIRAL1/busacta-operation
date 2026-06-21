import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { SinglePersonPicker } from "@/components/shared/single-person-picker";
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/shared/domain";
import { PriorityIcon } from "@/lib/ui/task-option-icons";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";
import { CaptchaBlock, useCaptchaGate } from "@/components/auth/captcha-confirm";

export function TaskEditButton({
  taskId,
  size = "icon",
}: {
  taskId: string;
  size?: "icon" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={size}
        variant="ghost"
        className={size === "icon" ? "h-8 w-8" : "h-7 text-xs gap-1"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Edit task"
      >
        <Pencil className="h-3.5 w-3.5" />
        {size === "sm" && "Edit"}
      </Button>
      {open && <TaskEditSheet taskId={taskId} open={open} onOpenChange={setOpen} />}
    </>
  );
}

export function TaskEditSheet({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const captcha = useCaptchaGate(taskId);
  const { data: task, isLoading } = useQuery({
    queryKey: ["task-edit", taskId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, description, status, priority, due_date, completed_at, assignee_id, reviewer_id",
        )
        .eq("id", taskId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<{
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string | null;
    completed_at: string | null;
    assignee_id: string | null;
    reviewer_id: string | null;
  } | null>(null);

  useEffect(() => {
    if (task) {
      captcha.reset();
      setForm({
        title: task.title ?? "",
        description: task.description ?? "",
        status: task.status as TaskStatus,
        priority: task.priority as TaskPriority,
        due_date: task.due_date ?? null,
        completed_at: (task as { completed_at?: string | null }).completed_at ?? null,
        assignee_id: task.assignee_id ?? null,
        reviewer_id: task.reviewer_id ?? null,
      });
    }
  }, [task]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const raw: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date,
        completed_at: form.completed_at,
        assignee_id: form.assignee_id,
        reviewer_id: form.reviewer_id,
      };
      // Guard: never send "" to enum columns — PostgreSQL rejects empty-string casts.
      const patch = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ""));
      const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task updated");
      qc.invalidateQueries({ queryKey: ["todos"] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["task-edit", taskId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit task</SheetTitle>
          <SheetDescription>Update title, status, assignment, and dates.</SheetDescription>
        </SheetHeader>
        {isLoading || !form ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={
                  !form.title.trim() ? "border-destructive focus-visible:ring-destructive" : ""
                }
              />
              {!form.title.trim() && <p className="text-xs text-destructive">Title is required</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}
                >
                  <SelectTrigger aria-label={`Priority: ${form.priority ?? "—"}`}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <PriorityIcon value={form.priority} />
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
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !form.due_date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.due_date ? format(new Date(form.due_date), "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.due_date ? new Date(form.due_date) : undefined}
                    onSelect={(d) =>
                      setForm({ ...form, due_date: d ? format(d, "yyyy-MM-dd") : null })
                    }
                  />
                  {form.due_date && (
                    <div className="p-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setForm({ ...form, due_date: null })}
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["completed_at"] as const).map((field) => {
                const label = "Completion date";
                const value = form[field];
                return (
                  <div className="space-y-1.5" key={field}>
                    <Label>{label}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !value && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {value ? format(new Date(value), "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={value ? new Date(value) : undefined}
                          onSelect={(d) => {
                            if (!d) return setForm({ ...form, [field]: null });
                            const iso = new Date(
                              d.getFullYear(),
                              d.getMonth(),
                              d.getDate(),
                              12,
                              0,
                              0,
                            ).toISOString();
                            setForm({ ...form, [field]: iso });
                          }}
                        />
                        {value && (
                          <div className="p-2 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full"
                              onClick={() => setForm({ ...form, [field]: null })}
                            >
                              Clear
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <SinglePersonPicker
                  value={form.assignee_id}
                  onChange={(v) => setForm({ ...form, assignee_id: v })}
                  placeholder="Assign…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reviewer</Label>
                <SinglePersonPicker
                  value={form.reviewer_id}
                  onChange={(v) => setForm({ ...form, reviewer_id: v })}
                  placeholder="Reviewer…"
                />
              </div>
            </div>
            <CaptchaBlock
              captchaKey={captcha.nonce}
              onValidChange={captcha.setValid}
              label="Solve this captcha before saving task edits."
            />
          </div>
        )}
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form?.title.trim() || !captcha.valid}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
