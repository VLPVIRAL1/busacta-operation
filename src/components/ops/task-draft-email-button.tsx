import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Copy, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RichEditor, RichViewer } from "@/components/shared/rich-editor";
import { cn } from "@/lib/shared/utils";
import { supabase } from "@/integrations/supabase/client";
import { templatesQuery } from "@/lib/queries/ops.queries";
import { substitutePlaceholders, type EmailPlaceholder } from "@/lib/ops/email-placeholders";
import { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS, labelFor } from "@/lib/shared/domain";

type ComplexityKey = "a_hard" | "b_medium" | "c_easy";
const COMPLEXITY_LABEL: Record<ComplexityKey, string> = {
  a_hard: "Hard",
  b_medium: "Medium",
  c_easy: "Easy",
};

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const stripTags = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Build the placeholder values for one task by fetching every related row. */
async function buildTaskPlaceholderData(taskId: string): Promise<Record<string, string>> {
  const [taskRes, actionItemsRes, notesRes, linksRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, title, status, priority, complexity, due_date, start_date, completed_at, period, tax_year, assignee_id, reviewer_id, client_entities(name, projects(name, firms(name)))",
      )
      .eq("id", taskId)
      .single(),
    supabase
      .from("task_action_items" as never)
      .select("title, kind, status")
      .eq("task_id", taskId)
      .is("deleted_at", null)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("task_notes")
      .select("body")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("task_links")
      .select("url, description")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false }),
  ]);

  const t = (taskRes.data ?? {}) as {
    title?: string | null;
    status?: string | null;
    priority?: string | null;
    complexity?: string | null;
    due_date?: string | null;
    start_date?: string | null;
    completed_at?: string | null;
    period?: string | null;
    tax_year?: number | null;
    assignee_id?: string | null;
    reviewer_id?: string | null;
    client_entities?: {
      name?: string | null;
      projects?: {
        name?: string | null;
        firms?: { name?: string | null } | null;
      } | null;
    } | null;
  };

  // Resolve assignee + reviewer display names.
  const userIds = [t.assignee_id, t.reviewer_id].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  let userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    userMap = new Map(
      ((profiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [
        p.id,
        p.full_name ?? "",
      ]),
    );
  }

  const items = (actionItemsRes.data ?? []) as unknown as {
    title: string;
    kind: string | null;
    status: string | null;
  }[];
  const clarificationsHtml =
    items.length === 0
      ? ""
      : `<ul>${items
          .map(
            (it) =>
              `<li>${stripTags(it.title)}${it.status === "done" ? " <em>(done)</em>" : ""}</li>`,
          )
          .join("")}</ul>`;

  const notes = (notesRes.data ?? []) as { body: string | null }[];
  const notesHtml = notes
    .map((n) => stripTags(n.body))
    .filter(Boolean)
    .map((s) => `<p>${s}</p>`)
    .join("");

  const links = (linksRes.data ?? []) as {
    url: string;
    description: string | null;
  }[];
  const linksHtml =
    links.length === 0
      ? ""
      : `<ul>${links
          .map(
            (l) =>
              `<li>${l.description ? `${stripTags(l.description)}: ` : ""}<a href="${l.url}">${l.url}</a></li>`,
          )
          .join("")}</ul>`;

  const firmName = t.client_entities?.projects?.firms?.name ?? "";
  const clientName = t.client_entities?.name ?? "";
  const projectName = t.client_entities?.projects?.name ?? "";

  return {
    client_name: clientName || firmName,
    client_group_name: firmName,
    contact_name: "",
    firm_name: firmName,
    project_name: projectName,
    entity_name: clientName,
    tax_year: t.tax_year ? String(t.tax_year) : "",
    period: t.period ?? "",
    task_name: t.title ?? "",
    task_status: t.status ? labelFor(TASK_STATUS_OPTIONS, t.status as never) : "",
    difficulty_level: COMPLEXITY_LABEL[(t.complexity ?? "b_medium") as ComplexityKey] ?? "",
    urgency: t.priority ? labelFor(TASK_PRIORITY_OPTIONS, t.priority as never) : "",
    clarifications_action_items: clarificationsHtml,
    task_notes: notesHtml,
    activity_notes: notesHtml,
    related_links: linksHtml,
    start_date: fmtDate(t.start_date),
    due_date: fmtDate(t.due_date),
    completion_date: fmtDate(t.completed_at),
    today: fmtDate(new Date().toISOString()),
    assignee_name: t.assignee_id ? (userMap.get(t.assignee_id) ?? "") : "",
    preparer_name: t.assignee_id ? (userMap.get(t.assignee_id) ?? "") : "",
    reviewer_name: t.reviewer_id ? (userMap.get(t.reviewer_id) ?? "") : "",
  };
}

export function TaskDraftEmailButton({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => setOpen(true)}
        title="Draft email from template"
      >
        <Mail className="h-4 w-4" />
        <span className="text-xs">Draft Email</span>
      </Button>
      {open && <DraftEmailDialog taskId={taskId} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function DraftEmailDialog({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: tplData, isLoading: tplLoading } = useQuery({
    ...templatesQuery(),
    enabled: open,
  });
  const { data: phData } = useQuery({
    queryKey: ["task-email-placeholders", taskId],
    enabled: open,
    queryFn: () => buildTaskPlaceholderData(taskId),
  });

  const emailTemplates = useMemo(
    () => (tplData?.templates ?? []).filter((t) => (t.category ?? "workflow") === "email"),
    [tplData],
  );

  const [search, setSearch] = useState("");
  const [tplId, setTplId] = useState<string | null>(null);
  const [step, setStep] = useState<"preview" | "customize">("preview");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearch("");
      setTplId(null);
      setStep("preview");
      setSubject("");
      setBody("");
      setCopied(false);
    }
  }, [open]);

  // When user picks a template, substitute placeholders and reset to preview.
  useEffect(() => {
    if (!tplId || !phData) return;
    const tpl = emailTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    setSubject(substitutePlaceholders(tpl.email_subject ?? "", phData));
    setBody(substitutePlaceholders(tpl.email_body ?? "", phData));
    setStep("preview");
  }, [tplId, phData, emailTemplates]);

  const filtered = emailTemplates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const copyAll = async () => {
    const plain = `Subject: ${subject}\n\n${stripTags(body)}`;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const html = `<p><strong>Subject:</strong> ${subject}</p>${body}`;
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      toast.success("Email copied");
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.error("Could not copy to clipboard");
      console.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-base">Draft Email from Template</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[260px_1fr] border-t min-h-[480px] max-h-[70vh]">
          {/* Left: template list */}
          <div className="border-r flex flex-col min-h-0">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-xs"
                  placeholder="Search email templates…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {tplLoading ? (
                <div className="p-4 text-xs text-muted-foreground">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">No email templates.</div>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTplId(t.id)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded text-xs truncate",
                      tplId === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                    title={t.name}
                  >
                    {t.name}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: preview or editable customize */}
          <div className="flex flex-col min-h-0">
            {!tplId ? (
              <div className="grid place-items-center h-full p-6 text-xs text-muted-foreground">
                Pick a template on the left to preview the email.
              </div>
            ) : step === "preview" ? (
              <div className="flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <span className="text-xs font-medium text-muted-foreground">Preview</span>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setStep("customize")}
                  >
                    Customize →
                  </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                  {subject && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Subject
                      </p>
                      <p className="text-sm font-medium">{subject}</p>
                    </div>
                  )}
                  {body && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Body
                      </p>
                      <div className="rounded-md border bg-muted/20 p-3">
                        <RichViewer html={body} className="text-sm" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Body</Label>
                  <div className="rounded-md border">
                    <RichEditor
                      value={body}
                      onChange={setBody}
                      placeholder="Edit the email body…"
                      minHeight={260}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="px-4 py-3 border-t">
          {step === "customize" && tplId && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto"
              onClick={() => setStep("preview")}
            >
              ← Back
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            disabled={!tplId || (!subject && !body)}
            onClick={copyAll}
            className="gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// satisfy unused import lints if RichEditor signature changes later
export type { EmailPlaceholder };
