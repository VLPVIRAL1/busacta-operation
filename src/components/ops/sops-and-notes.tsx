import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Pin, Plus, Trash2, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { RichEditor, RichViewer } from "@/components/shared/rich-editor";
import { cn } from "@/lib/shared/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { extractMentionIds, notify } from "@/lib/error/notify";

interface SopRow {
  id: string;
  title: string;
  body: string;
  is_internal: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface NoteRow {
  id: string;
  title: string | null;
  body: string;
  is_internal: boolean;
  is_pinned: boolean;
  created_by: string | null;
  created_at: string;
}

type Scope = { firm_id?: string; project_id?: string; direct_client_id?: string };

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim();

/** Multiple SOPs for a firm or project. Internal-only or client-visible. */
export function SopsPanel(scope: Scope) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isInternal = !!role && role !== "client";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SopRow | null>(null);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(true);
  const key = ["sops", scope];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase
        .from("sops")
        .select("id, title, body, is_internal, created_by, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (scope.firm_id) q = q.eq("firm_id", scope.firm_id);
      if (scope.project_id) q = q.eq("project_id", scope.project_id);
      // direct_client_id not in generated types yet — cast needed
      if (scope.direct_client_id) q = (q as any).eq("direct_client_id", scope.direct_client_id);
      const { data, error } = await q;
      if (error) throw error;
      return data as SopRow[];
    },
  });

  const reset = () => {
    setEditing(null);
    setTitle("");
    setTitleTouched(false);
    setBody("");
    setInternal(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const payload = {
        ...scope,
        title: title.trim(),
        body,
        is_internal: internal,
        created_by: user.id,
      };
      if (editing) {
        const { error } = await supabase
          .from("sops")
          .update({ title: payload.title, body: payload.body, is_internal: internal })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("sops") as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(editing ? "SOP updated" : "SOP created");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: key });
      const ids = extractMentionIds(stripHtml(body));
      if (ids.length) {
        await notify({
          user_ids: ids,
          kind: "mention",
          title: `Mentioned in SOP: ${title}`,
          body: stripHtml(body).slice(0, 200),
          firm_id: scope.firm_id ?? null,
          project_id: scope.project_id ?? null,
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("SOP deleted");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="h-full min-h-0 flex flex-col">
      <CardContent className="p-4 flex flex-col h-full min-h-0 gap-3">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold">SOPs</h3>
            <p className="text-xs text-muted-foreground">
              Standard operating procedures. Internal-only items are hidden from clients.
            </p>
          </div>
          {isInternal && (
            <Button
              size="sm"
              onClick={() => {
                reset();
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> New SOP
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-modern -mx-1 px-1">
          {isLoading ? (
            <Skeleton className="h-20" />
          ) : (data ?? []).length === 0 ? (
            <EmptyState title="No SOPs yet" description="Document repeatable processes here." />
          ) : (
            <div className="space-y-2">
              {(data ?? []).map((s) => (
                <div key={s.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{s.title}</span>
                        <Badge
                          variant={s.is_internal ? "secondary" : "default"}
                          className="text-[10px]"
                        >
                          {s.is_internal ? (
                            <>
                              <EyeOff className="h-3 w-3 mr-0.5" /> Internal
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3 mr-0.5" /> Client visible
                            </>
                          )}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        <RichViewer html={s.body} />
                      </div>
                    </div>
                    {isInternal && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditing(s);
                            setTitle(s.title);
                            setBody(s.body);
                            setInternal(s.is_internal);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm("Delete this SOP?")) remove.mutate(s.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) reset();
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit SOP" : "New SOP"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>
                  Heading <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setTitleTouched(true)}
                  placeholder="Short, descriptive heading…"
                  className={
                    titleTouched && !title.trim()
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                />
                {titleTouched && !title.trim() && (
                  <p className="text-xs text-destructive">Heading is required</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>
                  Body <span className="text-destructive">*</span>
                </Label>
                <RichEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Document the process… use the toolbar for formatting, paste images directly."
                  minHeight={260}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={internal} onCheckedChange={setInternal} id="sop-int" />
                <Label htmlFor="sop-int" className="text-xs cursor-pointer">
                  {internal ? "Internal only (hidden from clients)" : "Visible to client"}
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!title.trim() || !stripHtml(body) || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/** Multiple notes (timeline) for a firm or project. Pin + internal/client visibility. */
export function NotesPanel(scope: Scope) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isInternal = !!role && role !== "client";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NoteRow | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(true);
  const [pinned, setPinned] = useState(false);
  const key = ["notes", scope];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase
        .from("entity_notes")
        .select("id, title, body, is_internal, is_pinned, created_by, created_at")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (scope.firm_id) q = q.eq("firm_id", scope.firm_id);
      if (scope.project_id) q = q.eq("project_id", scope.project_id);
      // direct_client_id not in generated types yet — cast needed
      if (scope.direct_client_id) q = (q as any).eq("direct_client_id", scope.direct_client_id);
      const { data, error } = await q;
      if (error) throw error;
      return data as NoteRow[];
    },
  });

  const reset = () => {
    setEditing(null);
    setTitle("");
    setBody("");
    setInternal(true);
    setPinned(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (editing) {
        const { error } = await supabase
          .from("entity_notes")
          .update({
            title: title.trim() || null,
            body,
            is_internal: internal,
            is_pinned: pinned,
          })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("entity_notes") as any).insert({
          ...scope,
          title: title.trim() || null,
          body,
          is_internal: internal,
          is_pinned: pinned,
          created_by: user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(editing ? "Note updated" : "Note added");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: key });
      const ids = extractMentionIds(stripHtml(body));
      if (ids.length) {
        await notify({
          user_ids: ids,
          kind: "note",
          title: title?.trim() || "Mentioned you in a note",
          body: stripHtml(body).slice(0, 200),
          firm_id: scope.firm_id ?? null,
          project_id: scope.project_id ?? null,
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("entity_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note deleted");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="h-full min-h-0 flex flex-col">
      <CardContent className="p-4 flex flex-col h-full min-h-0 gap-3">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold">Notes</h3>
            <p className="text-xs text-muted-foreground">
              Timeline of updates and reminders. Pin important ones to the top.
            </p>
          </div>
          {isInternal && (
            <Button
              size="sm"
              onClick={() => {
                reset();
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add note
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-modern -mx-1 px-1">
          {isLoading ? (
            <Skeleton className="h-20" />
          ) : (data ?? []).length === 0 ? (
            <EmptyState
              title="No notes yet"
              description="Capture decisions, follow-ups, and context here."
            />
          ) : (
            <div className="space-y-2">
              {(data ?? []).map((n) => (
                <div key={n.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {n.is_pinned && <Pin className="h-3 w-3 text-amber-600" />}
                        {n.title && <span className="text-sm font-medium truncate">{n.title}</span>}
                        <Badge
                          variant={n.is_internal ? "secondary" : "default"}
                          className="text-[10px]"
                        >
                          {n.is_internal ? "Internal" : "Client visible"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1">
                        <RichViewer html={n.body} />
                      </div>
                    </div>
                    {isInternal && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditing(n);
                            setTitle(n.title ?? "");
                            setBody(n.body);
                            setInternal(n.is_internal);
                            setPinned(n.is_pinned);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm("Delete this note?")) remove.mutate(n.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) reset();
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit note" : "Add note"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>
                  Heading <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short, descriptive heading…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Body <span className="text-destructive">*</span>
                </Label>
                <RichEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Write your note… use the toolbar for formatting, paste images directly."
                  minHeight={220}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={internal} onCheckedChange={setInternal} id="note-int" />
                  <Label htmlFor="note-int" className="text-xs cursor-pointer">
                    {internal ? "Internal only" : "Client visible"}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={pinned} onCheckedChange={setPinned} id="note-pin" />
                  <Label htmlFor="note-pin" className="text-xs cursor-pointer">
                    Pin to top
                  </Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!title.trim() || !stripHtml(body) || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined SOPs + Notes panel
// Left : unified list — pinned notes → SOPs → unpinned notes
// Right: content viewer for the selected item
// ─────────────────────────────────────────────────────────────────────────────

type SopItem = SopRow & { kind: "sop" };
type NoteItem = NoteRow & { kind: "note" };
type UnifiedItem = SopItem | NoteItem;

export function SopsAndNotesCombinedPanel(scope: Scope) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isInternal = !!role && role !== "client";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<"sop" | "note" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKind, setDialogKind] = useState<"sop" | "note">("sop");
  const [editingItem, setEditingItem] = useState<UnifiedItem | null>(null);
  const [dlgTitle, setDlgTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [dlgBody, setDlgBody] = useState("");
  const [dlgInternal, setDlgInternal] = useState(true);
  const [dlgPinned, setDlgPinned] = useState(false);

  const scopeId = scope.firm_id ?? scope.project_id ?? scope.direct_client_id ?? "default";
  const sopKey = ["sops", scope];
  const noteKey = ["notes", scope];

  const { data: sops = [], isLoading: sopsLoading } = useQuery({
    queryKey: sopKey,
    queryFn: async () => {
      let q = supabase
        .from("sops")
        .select("id, title, body, is_internal, created_by, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (scope.firm_id) q = q.eq("firm_id", scope.firm_id);
      if (scope.project_id) q = q.eq("project_id", scope.project_id);
      // direct_client_id not in generated types yet — cast needed
      if (scope.direct_client_id) q = (q as any).eq("direct_client_id", scope.direct_client_id);
      const { data, error } = await q;
      if (error) throw error;
      return data as SopRow[];
    },
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: noteKey,
    queryFn: async () => {
      let q = supabase
        .from("entity_notes")
        .select("id, title, body, is_internal, is_pinned, created_by, created_at")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (scope.firm_id) q = q.eq("firm_id", scope.firm_id);
      if (scope.project_id) q = q.eq("project_id", scope.project_id);
      // direct_client_id not in generated types yet — cast needed
      if (scope.direct_client_id) q = (q as any).eq("direct_client_id", scope.direct_client_id);
      const { data, error } = await q;
      if (error) throw error;
      return data as NoteRow[];
    },
  });

  const items = useMemo<UnifiedItem[]>(() => {
    const sopItems: SopItem[] = sops.map((s) => ({ ...s, kind: "sop" as const }));
    const noteItems: NoteItem[] = notes.map((n) => ({ ...n, kind: "note" as const }));
    return [
      ...noteItems.filter((n) => n.is_pinned),
      ...sopItems,
      ...noteItems.filter((n) => !n.is_pinned),
    ];
  }, [sops, notes]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId && i.kind === selectedKind) ?? null,
    [items, selectedId, selectedKind],
  );

  const resetDialog = () => {
    setEditingItem(null);
    setDlgTitle("");
    setTitleTouched(false);
    setDlgBody("");
    setDlgInternal(true);
    setDlgPinned(false);
  };

  const openAdd = (kind: "sop" | "note") => {
    resetDialog();
    setDialogKind(kind);
    setDialogOpen(true);
  };

  const openEdit = (item: UnifiedItem) => {
    setEditingItem(item);
    setDialogKind(item.kind);
    setDlgTitle(item.title ?? "");
    setTitleTouched(false);
    setDlgBody(item.body);
    setDlgInternal(item.is_internal);
    setDlgPinned(item.kind === "note" ? item.is_pinned : false);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (dialogKind === "sop") {
        const payload = {
          ...scope,
          title: dlgTitle.trim(),
          body: dlgBody,
          is_internal: dlgInternal,
          created_by: user.id,
        };
        if (editingItem) {
          const { error } = await supabase
            .from("sops")
            .update({ title: payload.title, body: dlgBody, is_internal: dlgInternal })
            .eq("id", editingItem.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase.from("sops") as any).insert(payload);
          if (error) throw error;
        }
      } else {
        const notePayload = {
          ...scope,
          title: dlgTitle.trim() || null,
          body: dlgBody,
          is_internal: dlgInternal,
          is_pinned: dlgPinned,
          created_by: user.id,
        };
        if (editingItem) {
          const { error } = await supabase
            .from("entity_notes")
            .update({
              title: notePayload.title,
              body: dlgBody,
              is_internal: dlgInternal,
              is_pinned: dlgPinned,
            })
            .eq("id", editingItem.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase.from("entity_notes") as any).insert(notePayload);
          if (error) throw error;
        }
      }
    },
    onSuccess: async () => {
      const label = dialogKind === "sop" ? "SOP" : "Note";
      toast.success(editingItem ? `${label} updated` : `${label} added`);
      setDialogOpen(false);
      resetDialog();
      qc.invalidateQueries({ queryKey: dialogKind === "sop" ? sopKey : noteKey });
      const ids = extractMentionIds(stripHtml(dlgBody));
      if (ids.length) {
        await notify({
          user_ids: ids,
          kind: dialogKind === "sop" ? "mention" : "note",
          title: dlgTitle.trim() || "Mentioned you",
          body: stripHtml(dlgBody).slice(0, 200),
          firm_id: scope.firm_id ?? null,
          project_id: scope.project_id ?? null,
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: UnifiedItem) => {
      const table = item.kind === "sop" ? ("sops" as const) : ("entity_notes" as const);
      const { error } = await supabase.from(table).delete().eq("id", item.id);
      if (error) throw error;
      return item;
    },
    onSuccess: (item) => {
      toast.success(`${item.kind === "sop" ? "SOP" : "Note"} deleted`);
      if (selectedId === item.id && selectedKind === item.kind) {
        setSelectedId(null);
        setSelectedKind(null);
      }
      qc.invalidateQueries({ queryKey: item.kind === "sop" ? sopKey : noteKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (item: UnifiedItem) => {
    if (!confirm(`Delete this ${item.kind === "sop" ? "SOP" : "note"}?`)) return;
    deleteMutation.mutate(item);
  };

  const isSopDialog = dialogKind === "sop";
  const canSave =
    (!isSopDialog || !!dlgTitle.trim()) && !!stripHtml(dlgBody) && !saveMutation.isPending;

  const leftPane = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {sops.length} SOPs &middot; {notes.length} Notes
        </span>
        {isInternal && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => openAdd("sop")}
            >
              <Plus className="h-3 w-3" /> SOP
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => openAdd("note")}
            >
              <Plus className="h-3 w-3" /> Note
            </Button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {sopsLoading || notesLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nothing here yet"
              description="Add SOPs or notes using the buttons above."
            />
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => {
              const isSelected = item.id === selectedId && item.kind === selectedKind;
              const isSop = item.kind === "sop";
              const isPinnedNote = item.kind === "note" && item.is_pinned;
              const displayTitle = item.title?.trim() || (isSop ? "Untitled SOP" : "Untitled note");
              const dateStr = isSop ? (item as SopItem).updated_at : (item as NoteItem).created_at;
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  className={cn(
                    "group flex items-start gap-2 px-3 py-2.5 cursor-pointer transition-colors",
                    isSelected ? "bg-primary/10" : "hover:bg-muted/50",
                  )}
                  onClick={() => {
                    setSelectedId(item.id);
                    setSelectedKind(item.kind);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isPinnedNote && <Pin className="h-3 w-3 text-amber-600 shrink-0" />}
                      <span className="text-sm font-medium truncate">{displayTitle}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] px-1.5 h-4 shrink-0 font-semibold border",
                          isSop
                            ? "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300"
                            : "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300",
                        )}
                      >
                        {isSop ? "SOP" : "NOTE"}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(dateStr).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {" · "}
                      {item.is_internal ? "Internal" : "Client visible"}
                    </div>
                  </div>
                  {isInternal && (
                    <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(item);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const rightPane = selectedItem ? (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] px-1.5 h-4 font-semibold border shrink-0",
                selectedItem.kind === "sop"
                  ? "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300"
                  : "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300",
              )}
            >
              {selectedItem.kind === "sop" ? "SOP" : "NOTE"}
            </Badge>
            {selectedItem.kind === "note" && (selectedItem as NoteItem).is_pinned && (
              <Pin className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            )}
            <h3 className="text-sm font-semibold truncate">
              {selectedItem.title?.trim() || "Untitled"}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge
              variant={selectedItem.is_internal ? "secondary" : "default"}
              className="text-[10px]"
            >
              {selectedItem.is_internal ? "Internal" : "Client visible"}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {new Date(
                selectedItem.kind === "sop"
                  ? (selectedItem as SopItem).updated_at
                  : (selectedItem as NoteItem).created_at,
              ).toLocaleString()}
            </span>
          </div>
        </div>
        {isInternal && (
          <div className="flex gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => openEdit(selectedItem)}
            >
              <Pencil className="h-3 w-3" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => handleDelete(selectedItem)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <RichViewer html={selectedItem.body} />
      </div>
    </div>
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title="Select an item"
        description="Click a SOP or note on the left to view its content."
      />
    </div>
  );

  return (
    <>
      <ResizableTwoPane
        storageKey={`sops-notes-combined-${scopeId}`}
        defaultLeft={33}
        minLeft={22}
        maxLeft={55}
        left={leftPane}
        right={rightPane}
      />
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) resetDialog();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? `Edit ${isSopDialog ? "SOP" : "note"}`
                : `New ${isSopDialog ? "SOP" : "note"}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                Heading{" "}
                {isSopDialog ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="text-muted-foreground">(optional)</span>
                )}
              </Label>
              <Input
                value={dlgTitle}
                onChange={(e) => setDlgTitle(e.target.value)}
                onBlur={() => setTitleTouched(true)}
                placeholder="Short, descriptive heading…"
                className={
                  isSopDialog && titleTouched && !dlgTitle.trim() ? "border-destructive" : ""
                }
              />
              {isSopDialog && titleTouched && !dlgTitle.trim() && (
                <p className="text-xs text-destructive">Heading is required</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Body <span className="text-destructive">*</span>
              </Label>
              <RichEditor
                value={dlgBody}
                onChange={setDlgBody}
                placeholder={
                  isSopDialog ? "Document the process step by step…" : "Write your note…"
                }
                minHeight={220}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={dlgInternal} onCheckedChange={setDlgInternal} id="comb-int" />
                <Label htmlFor="comb-int" className="text-xs cursor-pointer">
                  {dlgInternal ? "Internal only" : "Client visible"}
                </Label>
              </div>
              {!isSopDialog && (
                <div className="flex items-center gap-2">
                  <Switch checked={dlgPinned} onCheckedChange={setDlgPinned} id="comb-pin" />
                  <Label htmlFor="comb-pin" className="text-xs cursor-pointer">
                    Pin to top
                  </Label>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!canSave}
              onClick={() => {
                setTitleTouched(true);
                if (canSave) saveMutation.mutate();
              }}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
