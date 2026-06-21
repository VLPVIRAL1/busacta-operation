import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Show the EXACT error from a failed React Query so users (and admins) can
 * see what's wrong instead of a stuck/empty screen.
 */
export function QueryErrorPanel({
  title = "Couldn't load data",
  error,
  onRetry,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <Card className="border-destructive/40">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-destructive/10 p-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{title}</div>
            <pre className="mt-2 overflow-auto rounded-md bg-destructive/10 border border-destructive/30 p-2.5 text-[11px] leading-relaxed text-destructive whitespace-pre-wrap break-words max-h-40">
              {message}
            </pre>
            {stack && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                  Stack trace
                </summary>
                <pre className="mt-1 overflow-auto rounded-md bg-muted/50 p-2 text-[10px] leading-tight text-muted-foreground whitespace-pre-wrap break-words max-h-48">
                  {stack}
                </pre>
              </details>
            )}
            {onRetry && (
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={onRetry} className="gap-2">
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
