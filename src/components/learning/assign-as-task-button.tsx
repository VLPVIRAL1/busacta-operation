import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SinglePersonPicker } from "@/components/shared/single-person-picker";
import { createTrainingTask } from "@/lib/learning/assignments.functions";

interface Props {
  courseTitle: string;
  pathTitle?: string;
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "sm" | "default";
}

export function AssignAsTaskButton({
  courseTitle,
  pathTitle,
  variant = "outline",
  size = "sm",
}: Props) {
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

  const mut = useMutation({
    mutationFn: () => {
      if (!assigneeId) throw new Error("Please select a staff member");
      return createTrainingTask({
        data: {
          courseTitle,
          pathTitle,
          assigneeId,
          dueDate: dueDate || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Training task created in Ops Hub");
      setOpen(false);
      setAssigneeId(null);
      setDueDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className="gap-1.5">
          <UserPlus className="h-3.5 w-3.5" />
          Assign as Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Training Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Creates a{" "}
              <span className="font-medium text-foreground">
                "Complete Training: {courseTitle}"
              </span>{" "}
              task in the Operations Hub.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assign to</Label>
            <SinglePersonPicker
              value={assigneeId}
              onChange={setAssigneeId}
              placeholder="Select staff member"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Due date (optional)</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!assigneeId || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Creating…" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
