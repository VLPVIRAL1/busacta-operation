// SharePoint Documents Panel — shown in the task Files tab above DocumentManager.
// Handles direct-to-SharePoint uploads and lists files from the `documents` table.
// Shows configuration banners when firm site / project library are not set up yet.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload,
  ExternalLink,
  Trash2,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/shared/utils";
import { formatBytes } from "@/lib/format/format-bytes";
import {
  listTaskSharePointDocuments,
  deleteSharePointDocument,
  getFirmSharePointStatus,
  getProjectSharePointStatus,
  type SpDocument,
} from "@/lib/sharepoint/sharepoint.functions";
import { supabase } from "@/integrations/supabase/client";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB — must match upload.ts

type UploadState = "idle" | "uploading" | "done" | "error";
type FileUploadStatus = { file: File; state: UploadState; error?: string };

// ─── Main component ───────────────────────────────────────────────────────────

export function SharePointDocumentsPanel({
  taskId,
  projectId,
  firmId,
}: {
  taskId: string;
  projectId: string | null | undefined;
  firmId: string | null | undefined;
}) {
  // Don't render at all if we have no project or firm IDs to check
  if (!projectId || !firmId) return null;

  return <SharePointPanelInner taskId={taskId} projectId={projectId} firmId={firmId} />;
}

function SharePointPanelInner({
  taskId,
  projectId,
  firmId,
}: {
  taskId: string;
  projectId: string;
  firmId: string;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<FileUploadStatus[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<SpDocument | null>(null);

  // Server function hooks
  const getFirmStatusFn = useServerFn(getFirmSharePointStatus);
  const getProjStatusFn = useServerFn(getProjectSharePointStatus);
  const listDocsFn = useServerFn(listTaskSharePointDocuments);
  const deleteDocFn = useServerFn(deleteSharePointDocument);

  // Firm SP status
  const { data: firmStatus, isLoading: firmLoading } = useQuery({
    queryKey: ["firm-sharepoint-status", firmId],
    queryFn: () => getFirmStatusFn({ data: { firm_id: firmId } }),
    staleTime: 60_000,
  });

  // Project SP status
  const { data: projStatus, isLoading: projLoading } = useQuery({
    queryKey: ["project-sharepoint-status", projectId],
    queryFn: () => getProjStatusFn({ data: { project_id: projectId } }),
    staleTime: 60_000,
  });

  // Documents list
  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["task-sp-docs", taskId],
    queryFn: () => listDocsFn({ data: { task_id: taskId } }),
    enabled: !!projStatus?.sharepoint_drive_id,
  });

  // Delete mutation
  const deleteMut = useMutation({
    mutationFn: (docId: string) => deleteDocFn({ data: { document_id: docId } }),
    onSuccess: () => {
      toast.success("File deleted from SharePoint");
      qc.invalidateQueries({ queryKey: ["task-sp-docs", taskId] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (firmLoading || projLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!firmStatus?.sp_site_id) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        SharePoint not configured for this firm. Go to the firm's{" "}
        <strong className="mx-1">Profile → SharePoint</strong> to set it up.
      </div>
    );
  }

  if (!projStatus?.sharepoint_drive_id) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        SharePoint library not configured for this project. Go to{" "}
        <strong className="mx-1">Project Settings → SharePoint</strong> to add the library URL.
      </div>
    );
  }

  // ── Upload handler ─────────────────────────────────────────────────────────
  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;

    const newUploads: FileUploadStatus[] = files.map((f) => ({ file: f, state: "idle" }));
    setUploads((prev) => [...newUploads, ...prev]);

    // Get auth token for the upload API
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i];

      if (f.size > MAX_UPLOAD_BYTES) {
        setUploads((prev) =>
          prev.map((u) =>
            u.file === f ? { ...u, state: "error", error: "Exceeds 200 MB limit" } : u,
          ),
        );
        continue;
      }

      setUploads((prev) => prev.map((u) => (u.file === f ? { ...u, state: "uploading" } : u)));

      try {
        const form = new FormData();
        form.append("taskId", taskId);
        form.append("projectId", projectId);
        form.append("file", f);

        const res = await fetch("/api/sharepoint/upload-document", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error((err as { error?: string }).error ?? "Upload failed");
        }

        setUploads((prev) => prev.map((u) => (u.file === f ? { ...u, state: "done" } : u)));
      } catch (e) {
        setUploads((prev) =>
          prev.map((u) =>
            u.file === f
              ? { ...u, state: "error", error: e instanceof Error ? e.message : "Upload failed" }
              : u,
          ),
        );
      }
    }

    qc.invalidateQueries({ queryKey: ["task-sp-docs", taskId] });
  }

  const hasActiveUploads = uploads.some((u) => u.state === "uploading");

  return (
    <>
      <Card
        className={cn("transition-colors", dragging && "border-primary ring-2 ring-primary/20")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">SharePoint Documents</CardTitle>
          <div className="ml-auto flex items-center gap-2">
            {hasActiveUploads && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={hasActiveUploads}
            >
              <Upload className="h-3.5 w-3.5" /> Upload files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* In-progress uploads */}
          {uploads.length > 0 && (
            <div className="border-b divide-y">
              {uploads.map((u, idx) => (
                <div key={idx} className="flex items-center gap-2 px-4 py-2 text-sm">
                  {u.state === "uploading" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                  )}
                  {u.state === "done" && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  )}
                  {u.state === "error" && (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )}
                  {u.state === "idle" && (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                  )}
                  <span className="flex-1 truncate text-muted-foreground">{u.file.name}</span>
                  {u.error && <span className="text-xs text-destructive shrink-0">{u.error}</span>}
                  {(u.state === "done" || u.state === "error") && (
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setUploads((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Documents list */}
          {docsLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : documents.length === 0 && uploads.filter((u) => u.state === "done").length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">
              No SharePoint documents yet. Drop files here or click Upload.
            </p>
          ) : (
            <div className="divide-y">
              {(documents as SpDocument[]).map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 px-4 py-2.5">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{doc.file_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(doc.uploaded_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {doc.file_size_bytes ? ` · ${formatBytes(doc.file_size_bytes)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.sharepoint_web_url && (
                      <a
                        href={doc.sharepoint_web_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Open in SharePoint"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete file"
                      onClick={() => setDeleteTarget(doc)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete from SharePoint?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.file_name}</strong> will be permanently deleted from SharePoint
              and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
