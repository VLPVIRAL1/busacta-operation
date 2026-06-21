import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { createDeployment } from "@/lib/organizer/deployments.functions";
import { createBulkDeployment } from "@/lib/organizer/bulk.functions";
import { listTemplates } from "@/lib/organizer/templates.functions";
import { timelogProfilesQuery } from "@/lib/queries/ops.queries";
import { type OrganizerPurpose, purposeLabel, type TargetType } from "@/lib/organizer/schemas";

/**
 * Universal "Send Organizer" button. Renders a dialog that picks a published
 * template (optionally filtered to a specific purpose), one or many assignees,
 * and an optional due date.
 *
 * When a target_type other than "profile" is supplied (e.g. course, task, project,
 * client_entity, firm), `target_id` is required and is the entity being addressed;
 * the assignee_profile_id picker still selects the human responder(s).
 */
export function SendOrganizerButton({
  targetType = "profile",
  targetId,
  targetLabel,
  firmId,
  defaultAssigneeIds,
  filterPurposes,
  variant = "default",
  size = "sm",
  buttonLabel = "Send Organizer",
  className,
}: {
  targetType?: TargetType;
  targetId?: string | null;
  targetLabel?: string;
  firmId?: string | null;
  defaultAssigneeIds?: string[];
  filterPurposes?: OrganizerPurpose[];
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  buttonLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Send className="h-4 w-4 mr-1" />
        {buttonLabel}
      </Button>
      {open && (
        <SendOrganizerDialog
          open={open}
          onOpenChange={setOpen}
          targetType={targetType}
          targetId={targetId ?? null}
          targetLabel={targetLabel}
          firmId={firmId ?? null}
          defaultAssigneeIds={defaultAssigneeIds ?? []}
          filterPurposes={filterPurposes}
        />
      )}
    </>
  );
}

function SendOrganizerDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetLabel,
  firmId,
  defaultAssigneeIds,
  filterPurposes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetType: TargetType;
  targetId: string | null;
  targetLabel?: string;
  firmId: string | null;
  defaultAssigneeIds: string[];
  filterPurposes?: OrganizerPurpose[];
}) {
  const qc = useQueryClient();
  const listTpl = useServerFn(listTemplates);
  const profilesQ = useQuery(timelogProfilesQuery());
  const createSingle = useServerFn(createDeployment);
  const createBulk = useServerFn(createBulkDeployment);

  const tplQ = useQuery({
    queryKey: ["organizer", "send-picker"],
    queryFn: () => listTpl(),
  });

  const [templateId, setTemplateId] = useState<string>("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(defaultAssigneeIds);
  const [dueAt, setDueAt] = useState<string>("");
  const [filter, setFilter] = useState<string>("");

  const publishedTemplates = useMemo(() => {
    const all = tplQ.data?.templates ?? [];
    return all.filter((t) => {
      if (t.status !== "published") return false;
      if (filterPurposes && filterPurposes.length > 0) {
        if (!filterPurposes.includes(t.purpose)) return false;
      }
      return true;
    });
  }, [tplQ.data, filterPurposes]);

  const filteredProfiles = useMemo(() => {
    const n = filter.trim().toLowerCase();
    return (profilesQ.data ?? []).filter((p) => {
      if (!n) return true;
      return (
        (p.full_name ?? "").toLowerCase().includes(n) || (p.email ?? "").toLowerCase().includes(n)
      );
    });
  }, [profilesQ.data, filter]);

  const toggle = (id: string) =>
    setAssigneeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const mut = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error("Pick a template");
      if (assigneeIds.length === 0) throw new Error("Pick at least one assignee");
      const effectiveTargetId =
        targetType === "profile" ? assigneeIds[0] : (targetId ?? assigneeIds[0]);
      if (assigneeIds.length === 1) {
        return createSingle({
          data: {
            template_id: templateId,
            target_type: targetType,
            target_id: effectiveTargetId,
            assignee_profile_id: assigneeIds[0],
            due_at: dueAt ? new Date(dueAt).toISOString() : null,
            firm_id: firmId,
          },
        });
      }
      const assignments = assigneeIds.map((id) => ({
        target_id: targetType === "profile" ? id : (targetId ?? id),
        assignee_profile_id: id,
      }));
      return createBulk({
        data: {
          template_id: templateId,
          target_type: targetType,
          assignments,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          firm_id: firmId,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizer"] });
      toast.success(
        assigneeIds.length > 1 ? `Sent to ${assigneeIds.length} people` : "Organizer sent",
      );
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Organizer</DialogTitle>
          <DialogDescription>
            {targetLabel
              ? `Target: ${targetLabel}`
              : "Pick a published template and one or more assignees."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    tplQ.isLoading
                      ? "Loading…"
                      : publishedTemplates.length === 0
                        ? "No published templates"
                        : "Pick a template"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {publishedTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    <span className="text-muted-foreground ml-2 text-xs">
                      · {purposeLabel[t.purpose]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Assignees</Label>
            <Input
              placeholder="Filter by name or email…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="border rounded-md">
              <ScrollArea className="h-56">
                <ul className="divide-y">
                  {filteredProfiles.map((p) => {
                    const checked = assigneeIds.includes(p.id);
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(p.id)}
                          id={`a-${p.id}`}
                        />
                        <label htmlFor={`a-${p.id}`} className="flex-1 text-sm cursor-pointer">
                          <span className="font-medium">{p.full_name ?? "—"}</span>
                          <span className="text-xs text-muted-foreground ml-2">{p.email}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {assigneeIds.map((id) => {
                const p = (profilesQ.data ?? []).find((x) => x.id === id);
                return (
                  <Badge key={id} variant="secondary" className="text-[10px] gap-1">
                    {p?.full_name ?? p?.email ?? id.slice(0, 6)}
                    <button
                      onClick={() => toggle(id)}
                      className="hover:text-destructive"
                      aria-label="Remove"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Due date (optional)</Label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !templateId || assigneeIds.length === 0}
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {assigneeIds.length > 1 ? `Send to ${assigneeIds.length}` : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
