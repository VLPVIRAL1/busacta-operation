import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Rich loading skeleton for report routes.
 * Shows a "Loading report…" caption after ~400ms so brief transitions don't flicker.
 */
export function ReportLoadingState({
  statCards = 4,
  showStats = true,
  caption = "Loading report…",
}: {
  statCards?: number;
  showStats?: boolean;
  caption?: string;
}) {
  const [showCaption, setShowCaption] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowCaption(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      {showStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: statCards }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-5 py-3 flex items-center justify-between">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="p-5 space-y-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {showCaption && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {caption}
        </div>
      )}
    </div>
  );
}
