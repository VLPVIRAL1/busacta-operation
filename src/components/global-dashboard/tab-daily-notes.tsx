import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfMonth } from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Pin,
  Plus,
  Search,
  Tag as TagIcon,
  X,
  Share2,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { syncNoteToOneNoteServerFn, getOneNoteStatusServerFn } from "@/lib/onenote/functions";
import {
  noteByIdQuery,
  notesByMonthQuery,
  sharedNotesQuery,
  dailyNoteTemplatesQuery,
  searchProfilesForMention,
  type DailyNoteSummary,
  type DailyNoteTemplateRow,
} from "@/lib/queries/global-dashboard.queries";
import { TemplateManagerDialog } from "./template-manager-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/shared/utils";
import { toast } from "sonner";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { DailyNotesEditor } from "./daily-notes-editor";
import { NoteColorPicker } from "./note-color-picker";
import { noteColor } from "./note-colors";
import { NOTE_TEMPLATES, type NoteTemplate } from "./note-templates";
import { exportDocx, exportMarkdown, exportPdf } from "@/lib/global-dashboard/note-export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}
function monthOf(iso: string) {
  return iso.slice(0, 7);
}

/** Walk a Tiptap JSON doc and collect plain text for word/char counts. */
function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  return n.content.map(extractText).join(" ");
}
function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Replace `{date}` literals inside a Tiptap doc with the long date string. */
function substituteDateTokens(node: unknown, dateLong: string): unknown {
  if (!node || typeof node !== "object") return node;
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") {
    return { ...node, text: n.text.replace(/\{date\}/g, dateLong) };
  }
  if (Array.isArray(n.content)) {
    return { ...node, content: n.content.map((c) => substituteDateTokens(c, dateLong)) };
  }
  return node;
}

export function TabDailyNotes() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const qc = useQueryClient();

  const [month, setMonth] = useState<string>(monthOf(todayISO()));
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [shareOpen, setShareOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [templateMgrOpen, setTemplateMgrOpen] = useState(false);
  const [templateSeed, setTemplateSeed] = useState<{ content: unknown; title: string } | null>(
    null,
  );
  const [oneNoteSyncState, setOneNoteSyncState] = useState<"idle" | "syncing" | "synced" | "error">(
    "idle",
  );

  const syncToOneNote = useServerFn(syncNoteToOneNoteServerFn);
  const getOneNoteStatus = useServerFn(getOneNoteStatusServerFn);

  const { data: oneNoteStatus } = useQuery({
    queryKey: ["onenote-status"],
    queryFn: () => getOneNoteStatus({}),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: monthNotes = [], isLoading: loadingList } = useQuery(
    notesByMonthQuery(userId, month),
  );
  const { data: shared = [] } = useQuery(sharedNotesQuery(userId));
  const { data: note, isLoading: loadingNote } = useQuery(noteByIdQuery(activeNoteId));
  const { data: userTemplates = [] } = useQuery(dailyNoteTemplatesQuery(userId));

  // Auto-pick most-recent note in the month, or none.
  useEffect(() => {
    if (activeNoteId) return;
    if (monthNotes.length > 0) setActiveNoteId(monthNotes[0].id);
  }, [monthNotes, activeNoteId]);

  // Clear the tag draft input when switching between notes.
  useEffect(() => {
    setTagDraft("");
  }, [activeNoteId]);

  // Title search + tag filter within the month.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monthNotes.filter((n) => {
      if (q && !(n.title || "").toLowerCase().includes(q)) return false;
      if (tagFilter && !(n.tags ?? []).includes(tagFilter)) return false;
      return true;
    });
  }, [monthNotes, search, tagFilter]);

  // Unique tags across the month, sorted for the filter rail.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of monthNotes) for (const t of n.tags ?? []) set.add(t);
    return Array.from(set).sort();
  }, [monthNotes]);

  // Pinned notes float to a dedicated section above the date groups.
  const pinned = useMemo(() => filtered.filter((n) => n.is_pinned), [filtered]);

  // Remaining notes grouped by date for the rail.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof monthNotes>();
    for (const n of filtered) {
      if (n.is_pinned) continue;
      const arr = map.get(n.note_date) ?? [];
      arr.push(n);
      map.set(n.note_date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const createNote = useMutation({
    mutationFn: async (vars: {
      forDate: string;
      template?: NoteTemplate;
      userTemplate?: DailyNoteTemplateRow;
    }) => {
      const todayLong = format(parseISO(vars.forDate), "EEEE, MMMM d, yyyy");
      const dateShort = format(parseISO(vars.forDate), "MMM d, yyyy");
      let title = "Untitled note";
      let doc: unknown = { type: "doc", content: [{ type: "paragraph" }] };
      if (vars.template) {
        title = vars.template.defaultTitle.replace("{date}", dateShort);
        doc = vars.template.buildDoc({ todayLong });
      } else if (vars.userTemplate) {
        title = (vars.userTemplate.default_title || "Untitled note").replace("{date}", dateShort);
        doc = substituteDateTokens(vars.userTemplate.content_json, todayLong);
      }
      const { data, error } = await supabase
        .from("daily_notes")
        .insert({
          owner_id: userId,
          note_date: vars.forDate,
          title,
          content_json: doc as never,
          updated_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id, vars) => {
      setMonth(monthOf(vars.forDate));
      setActiveNoteId(id);
      qc.invalidateQueries({ queryKey: ["global-dashboard", "notes-by-month", userId] });
    },
    onError: (e) => toast.error("Failed to create note", { description: (e as Error).message }),
  });

  const updateNote = useMutation({
    mutationFn: async (patch: {
      id: string;
      content_json?: unknown;
      title?: string;
      color?: string | null;
      is_pinned?: boolean;
      tags?: string[];
      note_date?: string;
    }) => {
      setSaveState("saving");
      const { error } = await supabase
        .from("daily_notes")
        .update({
          ...(patch.content_json !== undefined
            ? { content_json: patch.content_json as never }
            : {}),
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.is_pinned !== undefined ? { is_pinned: patch.is_pinned } : {}),
          ...(patch.tags !== undefined ? ({ tags: patch.tags } as never) : {}),
          ...(patch.note_date !== undefined ? { note_date: patch.note_date } : {}),
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      setSaveState("saved");
      qc.invalidateQueries({ queryKey: ["global-dashboard", "notes-by-month", userId] });
      qc.invalidateQueries({ queryKey: ["global-dashboard", "daily-note-by-id", vars.id] });
      setTimeout(() => setSaveState("idle"), 1200);

      // Fire-and-forget OneNote sync, only when content was saved and UPN is configured
      if (vars.content_json !== undefined && oneNoteStatus?.status === "ready") {
        setOneNoteSyncState("syncing");
        void syncToOneNote({ data: { noteId: vars.id } })
          .then((result) => {
            setOneNoteSyncState(result.ok ? "synced" : "error");
            if (!result.ok && result.reason === "error") {
              toast.error("OneNote sync failed", { description: result.message });
            }
            setTimeout(() => setOneNoteSyncState("idle"), result.ok ? 2500 : 4000);
          })
          .catch(() => {
            setOneNoteSyncState("error");
            setTimeout(() => setOneNoteSyncState("idle"), 4000);
          });
      }
    },
    onError: () => setSaveState("idle"),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      if (activeNoteId === id) setActiveNoteId(null);
      qc.invalidateQueries({ queryKey: ["global-dashboard", "notes-by-month", userId] });
      toast.success("Note deleted");
    },
  });

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  }

  const canEdit = !note || note.owner_id === userId; // shared notes are view-only in this iteration

  const togglePin = (n: DailyNoteSummary) =>
    updateNote.mutate({ id: n.id, is_pinned: !n.is_pinned });

  const renderOwnedNote = (n: DailyNoteSummary) => {
    const active = n.id === activeNoteId;
    const dot = noteColor(n.color);
    return (
      <li key={n.id} className="group/item relative">
        <button
          type="button"
          onClick={() => setActiveNoteId(n.id)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-7 text-left text-sm transition-colors",
            active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
          )}
        >
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10",
              n.color && n.color !== "default" ? dot.swatch : "bg-muted-foreground/25",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{n.title || "Untitled"}</span>
            {(n.tags ?? []).length > 0 && (
              <span className="mt-0.5 flex flex-wrap gap-1">
                {(n.tags ?? []).slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-muted px-1 text-[10px] leading-4 text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => togglePin(n)}
          title={n.is_pinned ? "Unpin" : "Pin"}
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 transition-opacity",
            n.is_pinned
              ? "text-primary opacity-100"
              : "text-muted-foreground opacity-0 hover:text-foreground group-hover/item:opacity-100",
          )}
        >
          <Pin className={cn("h-3 w-3", n.is_pinned && "fill-current")} />
        </button>
      </li>
    );
  };

  const left = (
    <div className="h-full min-h-0 flex flex-col border rounded-lg overflow-hidden bg-background">
      {/* Left rail */}
      <aside className="flex h-full min-h-0 flex-col">
        {/* Month selector */}
        <div className="flex items-center gap-1 border-b p-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="h-7 flex-1 justify-center gap-2 font-semibold">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(parseISO(`${month}-01`), "MMMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={parseISO(`${month}-01`)}
                onSelect={(d) => d && setMonth(format(startOfMonth(d), "yyyy-MM"))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Create */}
        <div className="border-b p-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              className="flex-1 justify-start gap-2"
              onClick={() => createNote.mutate({ forDate: todayISO() })}
              disabled={createNote.isPending}
            >
              <Plus className="h-3.5 w-3.5" />
              New note (today)
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="px-2"
                  title="New from template"
                  disabled={createNote.isPending}
                  aria-label="New from template"
                >
                  <FileText className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Start from template
                </p>
                {NOTE_TEMPLATES.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      createNote.mutate({ forDate: todayISO(), template: t });
                    }}
                    className="gap-2"
                  >
                    <span>{t.icon}</span>
                    <span className="flex-1">
                      <span className="block text-[13px] font-medium">{t.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {t.description}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
                {userTemplates.length > 0 && (
                  <>
                    <p className="mt-1 border-t px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Your templates
                    </p>
                    {userTemplates.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        onSelect={(e) => {
                          e.preventDefault();
                          createNote.mutate({ forDate: todayISO(), userTemplate: t });
                        }}
                        className="gap-2"
                      >
                        <span>{t.icon}</span>
                        <span className="flex-1">
                          <span className="block text-[13px] font-medium">{t.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {t.description || "Custom template"}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setTemplateSeed(null);
                    setTemplateMgrOpen(true);
                  }}
                  className="mt-1 gap-2 border-t pt-2"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="text-[13px] font-medium">Manage templates…</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="border-b p-2">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                  tagFilter === null
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                All
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTagFilter(t === tagFilter ? null : t)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                    tagFilter === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-accent",
                  )}
                >
                  #{t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes list grouped by date */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2 space-y-3">
            {loadingList ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {search
                  ? "No notes match your search."
                  : 'No notes this month. Click "New note" to start.'}
              </p>
            ) : (
              <>
                {pinned.length > 0 && (
                  <div>
                    <h4 className="flex items-center gap-1 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Pin className="h-3 w-3" /> Pinned
                    </h4>
                    <ul className="space-y-0.5">{pinned.map(renderOwnedNote)}</ul>
                  </div>
                )}
                {grouped.map(([dateISO, items]) => (
                  <div key={dateISO}>
                    <div className="flex items-center justify-between px-2 pb-1">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {format(parseISO(dateISO), "EEE, MMM d")}
                        {dateISO === todayISO() && (
                          <span className="ml-1 rounded bg-primary/15 px-1 text-[10px] text-primary">
                            Today
                          </span>
                        )}
                      </h4>
                      <button
                        type="button"
                        onClick={() => createNote.mutate({ forDate: dateISO })}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Add note for ${dateISO}`}
                        title="Add note to this day"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <ul className="space-y-0.5">{items.map(renderOwnedNote)}</ul>
                  </div>
                ))}
              </>
            )}

            {shared.length > 0 && (
              <div className="pt-2 border-t">
                <h4 className="flex items-center gap-1 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <UsersIcon className="h-3 w-3" /> Shared with me
                </h4>
                <ul className="space-y-0.5">
                  {shared.map((n) => {
                    const active = n.id === activeNoteId;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => setActiveNoteId(n.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                            active
                              ? "bg-primary/10 text-primary"
                              : "text-foreground hover:bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10",
                              n.color && n.color !== "default"
                                ? noteColor(n.color).swatch
                                : "bg-muted-foreground/25",
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{n.title || "Untitled"}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {format(parseISO(n.note_date), "MMM d")} · {n.permission}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>
    </div>
  );

  const right = (
    <div className="h-full min-h-0 flex flex-col border rounded-lg overflow-hidden bg-background">
      {/* Editor */}
      <main className="flex h-full min-h-0 flex-col">
        {!activeNoteId ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <FileText className="h-8 w-8 opacity-40" />
            <p>Select a note or create a new one.</p>
            <Button
              size="sm"
              onClick={() => createNote.mutate({ forDate: todayISO() })}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> New note
            </Button>
          </div>
        ) : loadingNote || !note ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className={cn("h-1 w-full shrink-0", noteColor(note.color).bar)} aria-hidden />
            <header className="flex items-center justify-between gap-3 border-b border-border/40 bg-background px-4 py-1.5">
              <div className="min-w-0 flex-1">
                <Input
                  defaultValue={note.title}
                  key={note.id}
                  disabled={!canEdit}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || "Untitled";
                    if (v !== note.title) updateNote.mutate({ id: note.id, title: v });
                  }}
                  className="h-6 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0"
                  placeholder="Untitled note"
                />
                <p className="text-[11px] text-muted-foreground">
                  {canEdit ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="rounded px-1 py-px hover:bg-muted hover:text-foreground"
                          title="Change date"
                        >
                          {format(parseISO(note.note_date), "EEEE, MMMM d, yyyy")}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={parseISO(note.note_date)}
                          onSelect={(d) => {
                            if (!d) return;
                            const iso = format(d, "yyyy-MM-dd");
                            if (iso !== note.note_date) {
                              updateNote.mutate({ id: note.id, note_date: iso });
                              setMonth(monthOf(iso));
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    format(parseISO(note.note_date), "EEEE, MMMM d, yyyy")
                  )}
                  {" · "}
                  {(() => {
                    const text = extractText(note.content_json);
                    const words = countWords(text);
                    const chars = text.replace(/\s+/g, " ").trim().length;
                    return (
                      <span>
                        {words} {words === 1 ? "word" : "words"} · {chars} chars
                      </span>
                    );
                  })()}
                  {" · "}
                  Auto-saves 2 seconds after you stop typing ·{" "}
                  <kbd className="rounded border bg-muted px-1">@</kbd> people ·{" "}
                  <kbd className="rounded border bg-muted px-1">#</kbd> tasks/projects ·{" "}
                  <kbd className="rounded border bg-muted px-1">/</kbd> blocks
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <TagIcon className="h-3 w-3 text-muted-foreground" />
                  {(note.tags ?? []).map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                    >
                      #{t}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            updateNote.mutate({
                              id: note.id,
                              tags: (note.tags ?? []).filter((x) => x !== t),
                            })
                          }
                          className="rounded-full hover:bg-primary/20"
                          aria-label={`Remove tag ${t}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {canEdit && (
                    <input
                      type="text"
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          const raw = tagDraft.trim().replace(/^#/, "");
                          if (!raw) return;
                          const next = Array.from(new Set([...(note.tags ?? []), raw]));
                          updateNote.mutate({ id: note.id, tags: next });
                          setTagDraft("");
                        } else if (e.key === "Backspace" && !tagDraft && (note.tags ?? []).length) {
                          const next = (note.tags ?? []).slice(0, -1);
                          updateNote.mutate({ id: note.id, tags: next });
                        }
                      }}
                      placeholder={(note.tags ?? []).length ? "Add tag…" : "Add tag (e.g. meeting)"}
                      className="h-5 min-w-[80px] border-0 bg-transparent p-0 text-[11px] outline-none placeholder:text-muted-foreground"
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {saveState === "saving" && (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                    </span>
                  )}
                  {saveState === "saved" && <span className="text-emerald-600">Saved</span>}
                  {saveState === "idle" && oneNoteSyncState === "syncing" && (
                    <span className="inline-flex items-center gap-1 text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin" /> Syncing to OneNote…
                    </span>
                  )}
                  {saveState === "idle" && oneNoteSyncState === "synced" && (
                    <span className="text-blue-600">Synced to OneNote ✓</span>
                  )}
                  {!canEdit && <span className="rounded bg-muted px-1.5 py-0.5">View only</span>}
                </span>
                {canEdit && (
                  <>
                    <NoteColorPicker
                      value={note.color}
                      onChange={(c) =>
                        updateNote.mutate({ id: note.id, color: c === "default" ? null : c })
                      }
                      align="end"
                      title="Note colour"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8",
                        note.is_pinned
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => updateNote.mutate({ id: note.id, is_pinned: !note.is_pinned })}
                      title={note.is_pinned ? "Unpin" : "Pin"}
                      aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
                    >
                      <Pin className={cn("h-4 w-4", note.is_pinned && "fill-current")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8",
                        focusMode ? "text-primary" : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setFocusMode((v) => !v)}
                      title={focusMode ? "Exit focus mode" : "Focus mode"}
                      aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
                    >
                      {focusMode ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5" title="Export">
                          <Download className="h-3.5 w-3.5" /> Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onSelect={() => exportPdf(note.content_json, note.title || "Untitled")}
                        >
                          PDF (via print)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            void exportDocx(note.content_json, note.title || "Untitled").catch(
                              (e) =>
                                toast.error("Export failed", { description: (e as Error).message }),
                            )
                          }
                        >
                          Word (.docx)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            exportMarkdown(note.content_json, note.title || "Untitled")
                          }
                        >
                          Markdown (.md)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setTemplateSeed({
                              content: note.content_json,
                              title: note.title || "Untitled",
                            });
                            setTemplateMgrOpen(true);
                          }}
                          className="border-t"
                        >
                          Save as template…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Dialog open={shareOpen} onOpenChange={setShareOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Share2 className="h-3.5 w-3.5" /> Share
                        </Button>
                      </DialogTrigger>
                      <ShareDialogContent
                        noteId={note.id}
                        ownerId={userId}
                        onClose={() => setShareOpen(false)}
                      />
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                      onClick={() => {
                        if (confirm("Delete this note?")) deleteNote.mutate(note.id);
                      }}
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden bg-background">
              <DailyNotesEditor
                key={note.id}
                resetKey={note.id}
                initialContent={note.content_json ?? null}
                onSave={(json) => updateNote.mutate({ id: note.id, content_json: json })}
                readOnly={!canEdit}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {focusMode ? (
        <div className="h-full min-h-0">{right}</div>
      ) : (
        <ResizableTwoPane
          storageKey="global-notes-split"
          defaultLeft={26}
          minLeft={18}
          maxLeft={50}
          hideToolbar
          left={left}
          right={right}
        />
      )}
      <TemplateManagerDialog
        open={templateMgrOpen}
        onOpenChange={(v) => {
          setTemplateMgrOpen(v);
          if (!v) setTemplateSeed(null);
        }}
        userId={userId}
        seedFromCurrent={templateSeed}
      />
    </div>
  );
}

// ---- Share dialog ----
function ShareDialogContent({
  noteId,
  ownerId,
  onClose,
}: {
  noteId: string;
  ownerId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; label: string; sub?: string }>>([]);
  const [existing, setExisting] = useState<
    Array<{ id: string; user_id: string; permission: string; name: string }>
  >([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing shares
  useEffect(() => {
    void (async () => {
      const { data: shares } = await supabase
        .from("daily_note_shares")
        .select("id, user_id, permission")
        .eq("note_id", noteId);
      const ids = (shares ?? []).map((s) => s.user_id as string);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
        : { data: [] };
      const pMap = new Map((profs ?? []).map((p) => [p.id as string, p]));
      setExisting(
        (shares ?? []).map((s) => {
          const p = pMap.get(s.user_id as string);
          return {
            id: s.id as string,
            user_id: s.user_id as string,
            permission: s.permission as string,
            name: (p?.full_name as string) ?? (p?.email as string) ?? "Unknown",
          };
        }),
      );
    })();
  }, [noteId]);

  // Search profiles
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const rows = await searchProfilesForMention(q);
      setResults(
        rows
          .filter((r) => r.id !== ownerId)
          .map((r) => ({
            id: r.id,
            label: r.full_name ?? r.email ?? "Unknown",
            sub: r.email ?? undefined,
          })),
      );
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, ownerId]);

  async function add(userId: string, permission: "view" | "edit") {
    const { error } = await supabase
      .from("daily_note_shares")
      .upsert(
        { note_id: noteId, user_id: userId, permission, granted_by: ownerId },
        { onConflict: "note_id,user_id" },
      );
    if (error) {
      toast.error("Failed to share", { description: error.message });
      return;
    }
    toast.success("Shared");
    qc.invalidateQueries({ queryKey: ["global-dashboard", "shared-notes"] });
    // refresh existing
    const { data: shares } = await supabase
      .from("daily_note_shares")
      .select("id, user_id, permission")
      .eq("note_id", noteId);
    const ids = (shares ?? []).map((s) => s.user_id as string);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] };
    const pMap = new Map((profs ?? []).map((p) => [p.id as string, p]));
    setExisting(
      (shares ?? []).map((s) => {
        const p = pMap.get(s.user_id as string);
        return {
          id: s.id as string,
          user_id: s.user_id as string,
          permission: s.permission as string,
          name: (p?.full_name as string) ?? (p?.email as string) ?? "Unknown",
        };
      }),
    );
  }

  async function revoke(shareId: string) {
    const { error } = await supabase.from("daily_note_shares").delete().eq("id", shareId);
    if (error) {
      toast.error("Failed to revoke");
      return;
    }
    setExisting((prev) => prev.filter((e) => e.id !== shareId));
    qc.invalidateQueries({ queryKey: ["global-dashboard", "shared-notes"] });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Share note</DialogTitle>
        <DialogDescription>
          Pick anyone in the organization to give them access. Concurrent edits use last-write-wins.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ScrollArea className="h-40 rounded-md border">
          <ul className="divide-y">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
            ) : (
              results.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.label}</p>
                    {r.sub && <p className="truncate text-[11px] text-muted-foreground">{r.sub}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => add(r.id, "view")}>
                    View
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => add(r.id, "edit")}>
                    Edit
                  </Button>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
        {existing.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Shared with
            </p>
            <ul className="divide-y rounded-md border">
              {existing.map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{e.name}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] capitalize">
                    {e.permission}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-rose-600"
                    onClick={() => revoke(e.id)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </DialogContent>
  );
}
