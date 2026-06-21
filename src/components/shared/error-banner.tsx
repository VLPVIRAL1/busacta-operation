import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Map raw Supabase/Postgres errors to safe, generic user-facing messages
// so we never leak schema, table, constraint, or RLS policy names.
function friendlyMessage(error: unknown): string {
  if (!error) return "Something went wrong. Please try again.";
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ((error as { message?: string })?.message ?? "");
  const msg = String(raw).toLowerCase();
  const code = (error as { code?: string })?.code;

  if (
    code === "PGRST301" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied")
  ) {
    return "You don't have permission to perform this action.";
  }
  if (code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return "This record already exists.";
  }
  if (code === "23503" || msg.includes("foreign key")) {
    return "This action references a record that no longer exists.";
  }
  if (code === "23502" || msg.includes("not-null")) {
    return "A required field is missing.";
  }
  if (code === "PGRST116" || msg.includes("no rows")) {
    return "The requested record was not found.";
  }
  if (msg.includes("jwt") || msg.includes("not authenticated")) {
    return "Your session has expired. Please sign in again.";
  }
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return "Network error. Please check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

export function ErrorBanner({
  title = "Couldn't load this data",
  error,
  onRetry,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const message = friendlyMessage(error);
  // Log full error server/console-side for debugging without exposing in DOM.
  if (error && typeof console !== "undefined") {
    console.error("[ErrorBanner]", error);
  }
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground break-words">{message}</div>
          <div className="mt-1 text-[11px] text-muted-foreground/80">
            If this keeps happening, contact your administrator.
          </div>
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5 shrink-0">
            <RefreshCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
