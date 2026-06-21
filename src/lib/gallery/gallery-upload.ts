// Upload hook for the File Gallery. Lives in src/lib (not a component) so the
// direct supabase storage call is permitted by the no-restricted-imports rule.
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordUploadedFile } from "@/lib/ops/task-documents.functions";

function uuid(): string {
  return crypto.randomUUID();
}

export function useGalleryUpload() {
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();
  const recordFileFn = useServerFn(recordUploadedFile);

  const uploadFiles = useCallback(
    async (taskId: string, folderPath: string, fileList: FileList | File[]) => {
      const arr = Array.from(fileList);
      if (!arr.length) return;
      setUploading(true);
      try {
        for (const f of arr) {
          const cleanName = f.name.replace(/[/\\]/g, "_");
          const storagePath = `${taskId}/${folderPath ? folderPath + "/" : ""}${uuid()}-${cleanName}`;
          const { error: storageErr } = await supabase.storage
            .from("task-attachments")
            .upload(storagePath, f);
          if (storageErr) throw new Error(storageErr.message);
          await recordFileFn({
            data: {
              taskId,
              folderPath,
              storagePath,
              filename: cleanName,
              sizeBytes: f.size,
              mimeType: f.type || null,
            },
          });
        }
        toast.success(`Uploaded ${arr.length} file${arr.length === 1 ? "" : "s"}`);
        qc.invalidateQueries({ queryKey: ["gallery-node-files"] });
        qc.invalidateQueries({ queryKey: ["gallery-tree"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [qc, recordFileFn],
  );

  return { uploadFiles, uploading };
}
