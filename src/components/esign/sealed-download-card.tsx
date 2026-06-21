import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * Hardened download trigger for sealed PDF / certificate signed URLs.
 *
 * Signed URLs from object storage can 404 (regenerated), expire, or
 * occasionally hang on slow networks. Instead of trusting the `<a download>`
 * navigation blindly, we probe the URL with a quick fetch, surface a clear
 * error state, and offer **Retry** (re-probe the same URL) and
 * **Regenerate** (invalidate the parent query so a fresh URL is fetched).
 */

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading" }
  | { kind: "error"; message: string };

const TIMEOUT_MS = 12_000;

async function probeUrl(url: string): Promise<void> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: ac.signal,
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Server returned ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export function SealedDownloadButton({
  url,
  filename,
  label,
  icon,
  variant = "default",
  onRegenerate,
}: {
  url: string;
  filename: string;
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "secondary" | "outline";
  /** Called when the user asks for a fresh signed URL (e.g. invalidate query). */
  onRegenerate?: () => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function trigger() {
    setStatus({ kind: "checking" });
    try {
      await probeUrl(url);
      setStatus({ kind: "downloading" });
      // Use a programmatic anchor — works around browsers that drop the
      // download attribute on cross-origin responses without explicit gestures.
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`Downloading ${filename}`);
      setTimeout(() => setStatus({ kind: "idle" }), 600);
    } catch (e) {
      const message =
        (e as Error).name === "AbortError"
          ? "The download took too long. Please retry."
          : ((e as Error).message ?? "Download failed");
      setStatus({ kind: "error", message });
    }
  }

  const isBusy = status.kind === "checking" || status.kind === "downloading";

  if (status.kind === "error") {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">Couldn't download {label.toLowerCase()}.</div>
            <div className="opacity-80 break-words">{status.message}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={trigger}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
          {onRegenerate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onRegenerate();
                setStatus({ kind: "idle" });
                toast.info("Generating a fresh link…");
              }}
            >
              Regenerate link
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Button size="sm" variant={variant} onClick={trigger} disabled={isBusy} aria-label={label}>
      {isBusy ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : status.kind === "idle" ? (
        (icon ?? <Download className="h-4 w-4 mr-1.5" />)
      ) : (
        <CheckCircle2 className="h-4 w-4 mr-1.5" />
      )}
      {label}
    </Button>
  );
}
