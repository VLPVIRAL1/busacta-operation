import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
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
import { createDeployment } from "@/lib/organizer/deployments.functions";
import { timelogProfilesQuery } from "@/lib/queries/ops.queries";

export function DeployTemplateDialog({
  templateId,
  templateName,
  open,
  onOpenChange,
}: {
  templateId: string;
  templateName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createDeployment);
  const profiles = useQuery(timelogProfilesQuery());
  const [assignee, setAssignee] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>("");

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          template_id: templateId,
          target_type: "profile",
          target_id: assignee,
          assignee_profile_id: assignee,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizer", "tracking"] });
      toast.success("Deployment created");
      onOpenChange(false);
      setAssignee("");
      setDueAt("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deploy "{templateName}"</DialogTitle>
          <DialogDescription>
            Assign this organizer to a team member. They'll see it in their Organizer Inbox.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Assignee</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a team member…" />
              </SelectTrigger>
              <SelectContent>
                {(profiles.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="due">Due date (optional)</Label>
            <Input id="due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!assignee || mut.isPending}>
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Deploy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
