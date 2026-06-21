import { useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

export type FileDropzoneProps = {
  /** Comma-separated extensions list, e.g. ".csv,.xlsx,.xls" */
  accept: string;
  /** Max file size in bytes. Defaults to 10 MB. */
  maxBytes?: number;
  /** Called with the validated File when the user picks/drops one. */
  onFile: (file: File) => void;
  disabled?: boolean;
  /** Helper text shown beneath the title. */
  hint?: ReactNode;
  /** Icon override; defaults to lucide Upload. */
  icon?: ReactNode;
  /** Primary label. */
  label?: string;
  className?: string;
};

/**
 * Generic, reusable drag-and-drop file picker. Validates extension + size on
 * the client and emits a single File. Use across hubs (HR import, COA import,
 * vendor import, …) instead of hand-rolling drop handlers.
 */
export function FileDropzone({
  accept,
  maxBytes = 10 * 1024 * 1024,
  onFile,
  disabled,
  hint,
  icon,
  label = "Click to upload",
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const allowed = accept
    .split(",")
    .map((s) => s.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);

  function validateAndEmit(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (allowed.length && !allowed.includes(ext)) {
      toast.error(
        `Unsupported file type ".${ext || "?"}". Use ${allowed.map((e) => `.${e}`).join(", ")}.`,
      );
      return;
    }
    if (file.size === 0) {
      toast.error("That file is empty.");
      return;
    }
    if (file.size > maxBytes) {
      toast.error(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
      );
      return;
    }
    onFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) validateAndEmit(f);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition cursor-pointer outline-none",
        "border-border-subtle bg-muted/30 hover:bg-muted/50",
        "focus-visible:ring-2 focus-visible:ring-ring",
        dragOver && "border-primary/60 bg-primary/5",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    >
      <div className="text-muted-foreground">{icon ?? <Upload className="h-8 w-8" />}</div>
      <div className="text-sm">
        <span className="font-medium text-primary">{label}</span> or drag and drop
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        Choose file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) validateAndEmit(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
