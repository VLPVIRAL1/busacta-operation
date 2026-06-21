import { AlertTriangle, Download, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

interface Props {
  message: string;
  url?: string | null;
  filename?: string;
  onRetry?: () => void;
  className?: string;
}

export function PdfErrorState({ message, url, filename, onRetry, className }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "mx-auto flex max-w-md flex-col items-center justify-center gap-3 rounded-md border bg-background/60 p-6 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="text-sm font-medium text-foreground">Couldn't display this PDF</p>
      <p className="text-xs text-muted-foreground break-words">{message}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        )}
        {url && (
          <>
            <Button size="sm" variant="outline" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
              </a>
            </Button>
            <Button size="sm" asChild>
              <a href={url} download={filename ?? true}>
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
