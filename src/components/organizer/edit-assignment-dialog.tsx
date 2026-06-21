import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { updateDeploymentAssignment } from "@/lib/organizer/tracking.functions";

type AssignmentStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "graded"
  | "returned"
  | "cancelled";

const STATUS_OPTIONS: AssignmentStatus[] = [
  "not_started",
  "in_progress",
  "submitted",
  "under_review",
  "graded",
  "returned",
  "cancelled",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deploymentId: string;
  current: {
    assignee_profile_id: string;
    assignee_name: string | null;
    due_at: string | null;
    status: string;
    template_name: string;
  };
}

export function EditAssignmentDialog({ open, onOpenChange, deploymentId, current }: Props) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateDeploymentAssignment);

  const [assignee, setAssignee] = useState(current.assignee_profile_id);
  const [due, setDue] = useState(current.due_at ? current.due_at.slice(0, 10) : "");
  const [status, setStatus] = useState<AssignmentStatus>(current.status as AssignmentStatus);

  useEffect(() => {
    if (open) {
      setAssignee(current.assignee_profile_id);
      setDue(current.due_at ? current.due_at.slice(0, 10) : "");
      setStatus(current.status as AssignmentStatus);
    }
  }, [open, current]);

  const { data: people, isLoading: peopleLoading } = useQuery({
    queryKey: ["organizer", "assignment-people"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>;
    },
    staleTime: 60_000,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const patch: {
        id: string;
        assignee_profile_id?: string;
        due_at?: string | null;
        status?: AssignmentStatus;
      } = { id: deploymentId };
      if (assignee !== current.assignee_profile_id) patch.assignee_profile_id = assignee;
      const dueIso = due ? new Date(due + "T00:00:00Z").toISOString() : null;
      const curIso = current.due_at;
      if (dueIso !== curIso) patch.due_at = dueIso;
      if (status !== current.status) patch.status = status;
      return updateFn({ data: patch });
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      qc.invalidateQueries({ queryKey: ["organizer", "tracking"] });
      qc.invalidateQueries({ queryKey: ["organizer", "tracking-overview"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty =
    assignee !== current.assignee_profile_id ||
    (due ? new Date(due + "T00:00:00Z").toISOString() : null) !== current.due_at ||
    status !== current.status;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit assignment</DialogTitle>
          <DialogDescription className="truncate">{current.template_name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="assignee">Assignee</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="assignee">
                <SelectValue placeholder={peopleLoading ? "Loading…" : "Choose a respondent"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(people ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email ?? p.id.slice(0, 8)}
                    {p.full_name && p.email && (
                      <span className="text-muted-foreground ml-1">({p.email})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="due">Due date</Label>
            <Input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <p className="text-xs text-muted-foreground">Leave blank for no due date.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AssignmentStatus)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Transitions are validated server-side against the state machine.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!dirty || mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
