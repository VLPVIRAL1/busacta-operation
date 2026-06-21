import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { Eye, Save, Loader2, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toolbar, buildFormatExtras, RichViewer } from "@/components/shared/rich-editor";
import { cn } from "@/lib/shared/utils";
import {
  EMAIL_PLACEHOLDERS,
  samplePlaceholderData,
  substitutePlaceholders,
  findUnknownTokens,
  findUsedKnownTokens,
  type EmailPlaceholder,
} from "@/lib/ops/email-placeholders";
import {
  updateWorkflowTemplate,
  type WorkflowTemplate as Template,
} from "@/lib/queries/ops.queries";

// ─── Preview dialog: substitute sample data ───────────────────
function EmailPreviewDialog({
  open,
  onOpenChange,
  subject,
  body,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subject: string;
  body: string;
}) {
  const data = samplePlaceholderData();
  const renderedSubject = substitutePlaceholders(subject, data);
  const renderedBody = substitutePlaceholders(body, data);
  const unknown = Array.from(new Set([...findUnknownTokens(subject), ...findUnknownTokens(body)]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email preview (sample data)</DialogTitle>
        </DialogHeader>
        {unknown.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              Unknown placeholder{unknown.length === 1 ? "" : "s"} — left as-is, no sample value:
              <span className="font-mono ml-1">{unknown.join(", ")}</span>
            </div>
          </div>
        )}
        <div className="rounded-lg border bg-background overflow-hidden">
          <div className="border-b bg-muted/40 px-4 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</div>
            <div className="text-sm font-semibold">
              {renderedSubject || <span className="italic text-muted-foreground">No subject</span>}
            </div>
          </div>
          <div className="px-4 py-3 max-h-[50vh] overflow-y-auto">
            {body ? (
              <RichViewer html={renderedBody} className="text-sm" />
            ) : (
              <p className="text-sm italic text-muted-foreground">No body content.</p>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Values are samples for verification only. Real merge values are supplied when the email is
          sent.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ─── Email detail body ────────────────────────────────────────
export function EmailDetailPane({ template, canEdit }: { template: Template; canEdit: boolean }) {
  const qc = useQueryClient();
  const subjectRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState(template.email_subject ?? "");
  const [body, setBody] = useState(template.email_body ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const lastFocus = useRef<"subject" | "body">("body");

  const editor = useEditor(
    {
      editable: canEdit,
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
        ...buildFormatExtras({ withImage: true }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: template.email_body ?? "",
      immediatelyRender: false,
      editorProps: {
        attributes: { class: cn("rich-content focus:outline-none px-4 py-3 min-h-[240px]") },
      },
      onUpdate: ({ editor }) => setBody(editor.getHTML()),
      onFocus: () => {
        lastFocus.current = "body";
      },
    },
    [template.id],
  );

  // Reset state when switching templates (editor rebuilds via deps above).
  useEffect(() => {
    setSubject(template.email_subject ?? "");
    setBody(template.email_body ?? "");
  }, [template.id, template.email_subject, template.email_body]);

  const dirty = subject !== (template.email_subject ?? "") || body !== (template.email_body ?? "");

  const save = useMutation({
    mutationFn: () =>
      updateWorkflowTemplate({
        id: template.id,
        name: template.name,
        description: template.description,
        template: null,
        email_subject: subject.trim() || null,
        email_body: body,
      }),
    onSuccess: () => {
      toast.success("Email template saved");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insertPlaceholder = (p: EmailPlaceholder) => {
    if (!canEdit) return;
    if (lastFocus.current === "subject") {
      const el = subjectRef.current;
      const start = el?.selectionStart ?? subject.length;
      const end = el?.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + p.token + subject.slice(end);
      setSubject(next);
      // Restore caret after the inserted token.
      requestAnimationFrame(() => {
        el?.focus();
        const pos = start + p.token.length;
        el?.setSelectionRange(pos, pos);
      });
    } else {
      editor?.chain().focus().insertContent(p.token).run();
    }
  };

  const usedFields = findUsedKnownTokens(`${subject} ${body}`);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2 shrink-0">
        <div className="text-xs text-muted-foreground">
          {usedFields.length > 0 ? (
            <>
              Fields in use:{" "}
              {usedFields.map((f) => (
                <span key={f.key} className="font-mono">
                  {f.token}{" "}
                </span>
              ))}
            </>
          ) : (
            "Insert {{placeholders}} below; Preview substitutes sample data."
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </Button>
          {canEdit && (
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {/* Subject */}
        <div className="space-y-1">
          <Label className="text-xs">Subject line</Label>
          <Input
            ref={subjectRef}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => {
              lastFocus.current = "subject";
            }}
            disabled={!canEdit}
            placeholder="e.g. Action required: {{client_name}} {{tax_year}} documents"
          />
        </div>

        {/* Placeholder palette */}
        {canEdit && (
          <div className="space-y-1.5">
            <Label className="text-xs">Insert placeholder</Label>
            <div className="space-y-1.5">
              {(["Client", "Engagement", "Task", "Dates", "Team"] as const).map((group) => {
                const groupItems = EMAIL_PLACEHOLDERS.filter((p) => p.group === group);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group} className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-16 shrink-0">
                      {group}
                    </span>
                    {groupItems.map((p) => (
                      <Button
                        key={p.key}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 gap-1 px-1.5 text-[11px] font-mono"
                        title={`${p.label} — sample: ${p.sample.replace(/<[^>]*>/g, " ").slice(0, 80)}`}
                        onClick={() => insertPlaceholder(p)}
                      >
                        <Plus className="h-2.5 w-2.5" />
                        {p.token}
                      </Button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="space-y-1">
          <Label className="text-xs">Body</Label>
          <div className="rounded-md border border-input bg-background">
            {canEdit && (
              <div className="border-b border-border/60 bg-muted/30 rounded-t-md">
                <Toolbar editor={editor} compact={false} bare />
              </div>
            )}
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <EmailPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        subject={subject}
        body={body}
      />
    </div>
  );
}
