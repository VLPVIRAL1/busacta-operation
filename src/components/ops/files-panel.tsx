import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Download, Loader2, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { formatBytes } from "@/lib/format/format-bytes";
import { cn } from "@/lib/shared/utils";

export interface AttachmentRow {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  message_id: string | null;
  uploader_id: string | null;
  created_at: string;
  tags: string[] | null;
  archived_at: string | null;
}

type StatusFilter = "active" | "archived" | "all";

/** Derive a content-type tag from MIME or filename extension. */
function contentTypeTag(mime: string | null | undefined, filename: string): string {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("spreadsheet") || m.includes("excel") || /\.(xls|xlsx|csv)$/i.test(filename))
    return "xls";
  if (m.includes("word") || /\.(doc|docx)$/i.test(filename)) return "doc";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "other";
}

function FileThumb({ attachment }: { attachment: AttachmentRow }) {
  const isImage = (attachment.mime_type ?? "").startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    supabase.storage
      .from("task-attachments")
      .createSignedUrl(attachment.storage_path, 300)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.storage_path, isImage]);
  if (!isImage) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Paperclip className="h-5 w-5" />
      </span>
    );
  }
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" />
      )}
    </div>
  );
}

export function FilesPanel({
  taskId,
  isInternal,
  taskTitle,
  firmName,
  clientName,
}: {
  taskId: string;
  isInternal: boolean;
  taskTitle: string;
  firmName: string;
  clientName?: string;
}) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = role === "admin" || role === "super_admin";
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [tagFilter, setTagFilter] = useState("");
  const [tagInput, setTagInput] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<AttachmentRow | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: files, isLoading } = useQuery({
    queryKey: ["attachments", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select(
          "id, filename, mime_type, size_bytes, storage_path, message_id, uploader_id, created_at, tags, archived_at",
        )
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AttachmentRow[];
    },
  });

  const uploadFiles = async (selected: FileList | File[]) => {
    if (!user) return;
    const list = Array.from(selected);
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const file of list) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
        const path = `${taskId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file);
        if (upErr) throw upErr;
        const autoTags = Array.from(
          new Set(
            [taskTitle, firmName, clientName, contentTypeTag(file.type, file.name)]
              .filter((t): t is string => !!t && t.trim().length > 0)
              .map((t) => t.trim()),
          ),
        );
        const { error: insErr } = await supabase.from("task_attachments").insert({
          task_id: taskId,
          filename: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          storage_path: path,
          uploader_id: user.id,
          tags: autoTags,
        });
        if (insErr) throw insErr;
      }
      toast.success(list.length === 1 ? "File uploaded" : `${list.length} files uploaded`);
      qc.invalidateQueries({ queryKey: ["attachments", taskId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void uploadFiles(e.target.files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isInternal) return;
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  };

  const download = async (a: AttachmentRow) => {
    const { data, error } = await supabase.storage
      .from("task-attachments")
      .createSignedUrl(a.storage_path, 60);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const setTags = async (a: AttachmentRow, tags: string[]) => {
    const { error } = await supabase.from("task_attachments").update({ tags }).eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["attachments", taskId] });
  };

  const toggleArchive = async (a: AttachmentRow) => {
    const { error } = await supabase
      .from("task_attachments")
      .update({ archived_at: a.archived_at ? null : new Date().toISOString() })
      .eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(a.archived_at ? "Restored" : "Archived");
    qc.invalidateQueries({ queryKey: ["attachments", taskId] });
  };

  const confirmDelete = async () => {
    const a = pendingDelete;
    if (!a) return;
    setPendingDelete(null);
    await supabase.storage.from("task-attachments").remove([a.storage_path]);
    const { error } = await supabase.from("task_attachments").delete().eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["attachments", taskId] });
  };

  const visible = useMemo(() => {
    const all = files ?? [];
    const byStatus = all.filter((f) => {
      if (statusFilter === "active") return !f.archived_at;
      if (statusFilter === "archived") return !!f.archived_at;
      return true;
    });
    const needle = tagFilter.trim().toLowerCase();
    if (!needle) return byStatus;
    return byStatus.filter(
      (f) =>
        (f.tags ?? []).some((t) => t.toLowerCase().includes(needle)) ||
        f.filename.toLowerCase().includes(needle),
    );
  }, [files, statusFilter, tagFilter]);

  const totalCount = files?.length ?? 0;
  const isFiltering = tagFilter.trim().length > 0 || statusFilter !== "active";

  return (
    <div
      className={cn("space-y-4", isDragging && "rounded-lg ring-2 ring-blue-400/60")}
      onDragOver={(e) => {
        if (isInternal) {
          e.preventDefault();
          setIsDragging(true);
        }
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      {isInternal && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Upload working papers, source documents, or returns. Drag files here or use the
                button — they're auto-tagged with task, firm, client, and file type.
              </div>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" hidden multiple onChange={handleUpload} />
                <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="sm">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                {(["active", "archived", "all"] as StatusFilter[]).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={statusFilter === s ? "default" : "ghost"}
                    className="h-7 px-2 text-[11px] capitalize"
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === "archived" ? <Archive className="mr-1 h-3 w-3" /> : null}
                    {s}
                  </Button>
                ))}
              </div>
              <Input
                placeholder="Filter by tag or filename…"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="h-7 max-w-[220px] text-[11px]"
              />
              <span className="text-[11px] text-muted-foreground">
                {visible.length} of {totalCount}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Paperclip className="h-10 w-10" />}
          title={isFiltering ? "No matches" : "No files yet"}
          description={
            isFiltering
              ? "Try a different filter or clear the search."
              : "Attach documents to share with your team or client."
          }
        />
      ) : (
        <div className="space-y-2">
          {visible.map((f) => {
            const tags = f.tags ?? [];
            const draft = tagInput[f.id] ?? "";
            const addTag = () => {
              const t = draft.trim();
              if (!t || tags.includes(t)) {
                setTagInput((s) => ({ ...s, [f.id]: "" }));
                return;
              }
              setTagInput((s) => ({ ...s, [f.id]: "" }));
              setTags(f, [...tags, t]);
            };
            return (
              <Card key={f.id} className={f.archived_at ? "opacity-60" : ""}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center gap-3">
                    <FileThumb attachment={f} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{f.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.size_bytes ? `${formatBytes(f.size_bytes)} · ` : ""}
                        {new Date(f.created_at).toLocaleString()}
                        {f.archived_at && " · archived"}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => download(f)} title="Download">
                      <Download className="h-4 w-4" />
                    </Button>
                    {isInternal && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleArchive(f)}
                        title={f.archived_at ? "Restore" : "Archive"}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setPendingDelete(f)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-[60px]">
                    {tags.map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="h-5 gap-1 px-1.5 py-0 text-[10px]"
                      >
                        {t}
                        {isInternal && (
                          <button
                            type="button"
                            onClick={() =>
                              setTags(
                                f,
                                tags.filter((x) => x !== t),
                              )
                            }
                            className="hover:text-destructive"
                            aria-label={`Remove tag ${t}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </Badge>
                    ))}
                    {isInternal && (
                      <div className="flex items-center gap-1">
                        <Input
                          placeholder="Add tag…"
                          value={draft}
                          onChange={(e) => setTagInput((s) => ({ ...s, [f.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTag();
                            }
                          }}
                          className="h-6 w-24 px-2 text-[11px]"
                        />
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={addTag}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.filename} will be permanently removed from storage. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
