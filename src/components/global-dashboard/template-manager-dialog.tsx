/**
 * Manage user-defined Daily Notes templates: list, create from a blank doc or
 * from the current note, edit, duplicate, delete. Built-in templates from
 * `note-templates.ts` are shown as read-only.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  dailyNoteTemplatesQuery,
  type DailyNoteTemplateRow,
} from "@/lib/queries/global-dashboard.queries";
import { NOTE_TEMPLATES, type NoteTemplate } from "./note-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DailyNotesEditor } from "./daily-notes-editor";
import { cn } from "@/lib/shared/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** When set, prefills the create form with this content as a starting point. */
  seedFromCurrent?: { content: unknown; title: string } | null;
};

type DraftRow = {
  id?: string;
  name: string;
  icon: string;
  description: string;
  default_title: string;
  content_json: unknown;
};

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export function TemplateManagerDialog({ open, onOpenChange, userId, seedFromCurrent }: Props) {
  const qc = useQueryClient();
  const { data: userTemplates = [], isLoading } = useQuery(dailyNoteTemplatesQuery(userId));
  const [editing, setEditing] = useState<DraftRow | null>(null);

  const saveTemplate = useMutation({
    mutationFn: async (draft: DraftRow) => {
      const payload = {
        user_id: userId,
        name: draft.name.trim() || "Untitled template",
        icon: draft.icon.trim() || "📄",
        description: draft.description.trim(),
        default_title: draft.default_title.trim() || "Untitled note",
        content_json: draft.content_json as never,
      };
      if (draft.id) {
        const { error } = await supabase
          .from("daily_note_templates" as never)
          .update(payload as never)
          .eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("daily_note_templates" as never)
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["global-dashboard", "daily-note-templates", userId] });
      toast.success("Template saved");
      setEditing(null);
    },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("daily_note_templates" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["global-dashboard", "daily-note-templates", userId] });
      toast.success("Template deleted");
    },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  function startNew() {
    setEditing({
      name: "",
      icon: "📄",
      description: "",
      default_title: "Untitled note",
      content_json: seedFromCurrent?.content ?? EMPTY_DOC,
    });
  }

  function startEdit(t: DailyNoteTemplateRow) {
    setEditing({
      id: t.id,
      name: t.name,
      icon: t.icon,
      description: t.description,
      default_title: t.default_title,
      content_json: t.content_json,
    });
  }

  function duplicateBuiltin(t: NoteTemplate) {
    setEditing({
      name: `${t.name} (copy)`,
      icon: t.icon,
      description: t.description,
      default_title: t.defaultTitle,
      content_json: t.buildDoc({ todayLong: "{date}" }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(95vw,1100px)] max-w-none overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>Note templates</DialogTitle>
          <DialogDescription>
            Create, edit and reuse your own Daily Notes templates. Built-in templates can be
            duplicated to make an editable copy.
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <TemplateEditor
            draft={editing}
            onChange={setEditing}
            onSave={() => saveTemplate.mutate(editing!)}
            onCancel={() => setEditing(null)}
            saving={saveTemplate.isPending}
          />
        ) : (
          <div className="grid max-h-[70vh] grid-cols-2 gap-4 overflow-y-auto p-5">
            <section>
              <header className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Your templates</h3>
                <Button size="sm" onClick={startNew} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> New template
                </Button>
              </header>
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : userTemplates.length === 0 ? (
                <p className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No custom templates yet. Click <strong>New template</strong> or duplicate a
                  built-in.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {userTemplates.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start gap-2 rounded border border-border/40 p-2 hover:bg-muted/40"
                    >
                      <span className="text-lg">{t.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {t.description || "No description"}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEdit(t)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-600"
                        onClick={() => {
                          if (confirm(`Delete template "${t.name}"?`)) deleteTemplate.mutate(t.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <header className="mb-2">
                <h3 className="text-sm font-semibold">Built-in templates</h3>
                <p className="text-[11px] text-muted-foreground">
                  Duplicate to make an editable copy.
                </p>
              </header>
              <ul className="space-y-1.5">
                {NOTE_TEMPLATES.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-2 rounded border border-border/40 p-2"
                  >
                    <span className="text-lg">{t.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {t.name}
                        <span className="rounded-sm bg-muted px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                          Built-in
                        </span>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {t.description}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => duplicateBuiltin(t)}
                      title="Duplicate"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  draft: DraftRow;
  onChange: (d: DraftRow) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="grid grid-cols-[180px_1fr_220px] gap-3 border-b p-4">
        <label className="text-xs font-medium">
          Icon
          <Input
            value={draft.icon}
            onChange={(e) => onChange({ ...draft, icon: e.target.value })}
            className="mt-1 text-center text-lg"
            maxLength={4}
          />
        </label>
        <label className="text-xs font-medium">
          Name
          <Input
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            className="mt-1"
            placeholder="e.g. Weekly review"
          />
        </label>
        <label className="text-xs font-medium">
          Default title
          <Input
            value={draft.default_title}
            onChange={(e) => onChange({ ...draft, default_title: e.target.value })}
            className="mt-1"
            placeholder="e.g. Weekly review — {date}"
          />
        </label>
        <label className="col-span-3 text-xs font-medium">
          Description
          <Textarea
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            className="mt-1 min-h-[40px]"
            placeholder="What this template is for"
          />
        </label>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-hidden border-b")}>
        <DailyNotesEditor
          initialContent={draft.content_json}
          onSave={(json) => onChange({ ...draft, content_json: json })}
          resetKey={draft.id ?? "new"}
        />
      </div>
      <DialogFooter className="px-4 py-3">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Save template
        </Button>
      </DialogFooter>
    </div>
  );
}
