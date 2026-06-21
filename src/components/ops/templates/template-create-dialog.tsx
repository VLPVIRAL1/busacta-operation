import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListChecks, MessageCircleQuestion, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { createWorkflowTemplate, type TemplateCategory } from "@/lib/queries/ops.queries";

const TYPE_OPTIONS: { value: TemplateCategory; label: string; hint: string }[] = [
  {
    value: "workflow",
    label: "Workflow checklist",
    hint: "Reusable engagement checklist → injects sub-tasks",
  },
  {
    value: "clarification",
    label: "Clarification / Action",
    hint: "Clarification items → generate task action items",
  },
  { value: "email", label: "Email template", hint: "Subject + rich body with {{placeholders}}" },
];

const TYPE_ICON: Record<TemplateCategory, typeof ListChecks> = {
  workflow: ListChecks,
  clarification: MessageCircleQuestion,
  email: Mail,
};

/**
 * Unified create modal for all three template categories. Mirrors the original
 * "New workflow template" dialog and adds a Template Type selector so the user
 * flags the row as Workflow / Clarification & Action / Email.
 */
export function TemplateCreateDialog({
  open,
  onOpenChange,
  defaultCategory,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCategory: TemplateCategory;
  onCreated: (category: TemplateCategory) => void;
}) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<TemplateCategory>(defaultCategory);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tplKey, setTplKey] = useState("");
  const [subject, setSubject] = useState("");

  // Reset to the active category each time the dialog opens.
  useEffect(() => {
    if (open) {
      setCategory(defaultCategory);
      setName("");
      setDesc("");
      setTplKey("");
      setSubject("");
    }
  }, [open, defaultCategory]);

  const create = useMutation({
    mutationFn: () =>
      createWorkflowTemplate({
        name: name.trim(),
        description: desc.trim() || null,
        template: category === "workflow" ? tplKey.trim() || null : null,
        category,
        email_subject: category === "email" ? subject.trim() || null : null,
        email_body: category === "email" ? "" : null,
      }),
    onSuccess: () => {
      toast.success("Template created");
      qc.invalidateQueries({ queryKey: ["templates"] });
      onCreated(category);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Template type *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => {
                  const Icon = TYPE_ICON[o.value];
                  return (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {o.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {TYPE_OPTIONS.find((o) => o.value === category)?.hint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder={
                category === "email"
                  ? "e.g. Missing documents reminder"
                  : category === "clarification"
                    ? "e.g. 1040 review clarifications"
                    : "e.g. 1065 Partnership"
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>

          {category === "workflow" && (
            <div className="space-y-1.5">
              <Label>
                Template key <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                value={tplKey}
                onChange={(e) => setTplKey(e.target.value)}
                placeholder="e.g. form_1065"
              />
              <p className="text-xs text-muted-foreground">
                Used for auto-injection by project form type.
              </p>
            </div>
          )}

          {category === "email" && (
            <div className="space-y-1.5">
              <Label>
                Subject line <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Action required: {{client_name}} documents"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
