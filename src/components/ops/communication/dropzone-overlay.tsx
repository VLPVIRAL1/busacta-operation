import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Wraps a conversation pane to enable drag-and-drop file uploads.
 * On drop, files are uploaded to the task-attachments bucket and a
 * message is posted with markdown links to signed URLs.
 *
 * For task scope, also inserts a row in task_attachments.
 */
export function DropzoneOverlay({
  scope,
  taskId,
  threadId,
  clientVisible = false,
  children,
}: {
  scope: "task" | "chat";
  taskId?: string;
  threadId?: string;
  /**
   * Task-scope only. When true, attachments + the wrapping message inherit
   * is_client_visible: true so the client portal can see them. Mirrors the
   * composer toggle in ThreadChat. Default false (Internal Only).
   */
  clientVisible?: boolean;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragCount = useRef(0);

  useEffect(() => {
    const onEnd = () => {
      dragCount.current = 0;
      setDragOver(false);
    };
    window.addEventListener("dragend", onEnd);
    window.addEventListener("drop", onEnd);
    return () => {
      window.removeEventListener("dragend", onEnd);
      window.removeEventListener("drop", onEnd);
    };
  }, []);

  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragCount.current += 1;
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current = Math.max(0, dragCount.current - 1);
    if (dragCount.current === 0) setDragOver(false);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0 || !user) return;
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      toast.error(`${tooBig.name} exceeds 20MB limit`);
      return;
    }
    setUploading(true);
    try {
      const links: string[] = [];
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
        const folder = taskId ?? threadId ?? "comm";
        const path = `${folder}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file);
        if (upErr) throw upErr;
        if (scope === "task" && taskId) {
          await supabase.from("task_attachments").insert({
            task_id: taskId,
            filename: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            storage_path: path,
            uploader_id: user.id,
            tags: [],
            is_client_visible: clientVisible,
          });
        }
        const { data: signed } = await supabase.storage
          .from("task-attachments")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        links.push(`📎 [${file.name}](${signed?.signedUrl ?? path})`);
      }

      const body = links.join("\n");
      if (scope === "task" && taskId) {
        await supabase.from("task_messages").insert({
          task_id: taskId,
          author_id: user.id,
          body,
          is_client_visible: clientVisible,
          client_msg_id: crypto.randomUUID(),
        });
      } else if (scope === "chat" && threadId) {
        await supabase.from("chat_messages").insert({
          thread_id: threadId,
          author_id: user.id,
          body,
          client_msg_id: crypto.randomUUID(),
        });
        await supabase
          .from("chat_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId);
      }
      toast.success(files.length === 1 ? "Attachment sent" : `${files.length} attachments sent`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="relative flex h-full min-h-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
      {(dragOver || uploading) && (
        <div
          className={cn(
            "pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2",
            "rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm",
          )}
        >
          <Upload className="h-7 w-7 text-primary" />
          <div className="text-sm font-medium">
            {uploading ? "Uploading…" : "Drop files to attach"}
          </div>
          <div className="text-[11px] text-muted-foreground">Up to 20MB each</div>
        </div>
      )}
    </div>
  );
}
