import { useEffect, useState } from "react";
import { Loader2, Upload, X, FileIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface UploadEntry {
  path: string;
  name: string;
  size: number;
}

interface FileUploadValue {
  files?: UploadEntry[];
}

const BUCKET = "organizer-uploads";

/**
 * In-wizard file uploader for `file_upload` blocks. Files are uploaded to the
 * private `organizer-uploads` bucket. Storage path: {deploymentId}/{blockId}/{uuid}.{ext}.
 * Value stored in response: { files: [{path, name, size}, ...] }.
 */
export function WizardFileUpload({
  deploymentId,
  blockId,
  value,
  disabled,
  onChange,
  config,
}: {
  deploymentId: string;
  blockId: string;
  value: unknown;
  disabled?: boolean;
  onChange: (v: FileUploadValue) => void;
  config: Record<string, unknown>;
}) {
  const current: UploadEntry[] = Array.isArray((value as FileUploadValue | undefined)?.files)
    ? ((value as FileUploadValue).files as UploadEntry[])
    : [];
  const [uploading, setUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());

  const maxFiles = typeof config.maxFiles === "number" ? (config.maxFiles as number) : 10;
  const maxSizeMb = typeof config.maxSizeMb === "number" ? (config.maxSizeMb as number) : 25;
  const accept = typeof config.accept === "string" ? (config.accept as string) : undefined;

  // Refresh signed URLs (1h) for current files for preview/download.
  useEffect(() => {
    let cancelled = false;
    if (current.length === 0) return;
    void (async () => {
      const next = new Map<string, string>();
      for (const f of current) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 3600);
        if (data?.signedUrl) next.set(f.path, data.signedUrl);
      }
      if (!cancelled) setSignedUrls(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.length]);

  async function handleFiles(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    if (current.length + filesList.length > maxFiles) {
      toast.error(`Limit is ${maxFiles} files`);
      return;
    }
    setUploading(true);
    const added: UploadEntry[] = [];
    try {
      for (const f of Array.from(filesList)) {
        if (f.size > maxSizeMb * 1024 * 1024) {
          toast.error(`"${f.name}" exceeds ${maxSizeMb}MB`);
          continue;
        }
        const ext = f.name.includes(".") ? f.name.split(".").pop() : "bin";
        const id = crypto.randomUUID();
        const path = `${deploymentId}/${blockId}/${id}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
          contentType: f.type || "application/octet-stream",
        });
        if (error) {
          toast.error(`Upload failed: ${error.message}`);
          continue;
        }
        added.push({ path, name: f.name, size: f.size });
      }
      if (added.length > 0) {
        onChange({ files: [...current, ...added] });
      }
    } finally {
      setUploading(false);
    }
  }

  async function remove(path: string) {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      toast.error(`Remove failed: ${error.message}`);
      return;
    }
    onChange({ files: current.filter((f) => f.path !== path) });
  }

  return (
    <div className="space-y-2">
      {current.length > 0 && (
        <ul className="space-y-1">
          {current.map((f) => {
            const url = signedUrls.get(f.path);
            return (
              <li
                key={f.path}
                className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
              >
                <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 truncate underline-offset-2 hover:underline"
                  >
                    {f.name}
                  </a>
                ) : (
                  <span className="flex-1 truncate">{f.name}</span>
                )}
                <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                {!disabled && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => remove(f.path)}
                    title="Remove"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!disabled && current.length < maxFiles && (
        <label className="inline-flex">
          <input
            type="file"
            multiple
            className="hidden"
            accept={accept}
            disabled={uploading}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-muted">
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading ? "Uploading…" : "Add files"}
          </span>
        </label>
      )}
      <p className="text-[10px] text-muted-foreground">
        Up to {maxFiles} files · {maxSizeMb}MB each
      </p>
    </div>
  );
}
