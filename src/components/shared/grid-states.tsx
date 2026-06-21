/**
 * Shared status surfaces for the infinite-virtual ops grids
 * (Notifications, Activity, Time Logs). Keeps loading skeletons, empty
 * state, error state, and "loading more" footer consistent across pages.
 */
import type { ReactNode } from "react";
import { AlertTriangle, RefreshCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./empty-state";
import { cn } from "@/lib/shared/utils";

export function GridSkeletonRows({
  rows = 12,
  rowHeight = 36,
}: {
  rows?: number;
  rowHeight?: number;
}) {
  return (
    <ul className="divide-y" aria-label="Loading rows">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="px-3 py-2" style={{ height: rowHeight }}>
          <Skeleton className="h-5 w-full" />
        </li>
      ))}
    </ul>
  );
}

export function GridLoadingMore({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 px-3 py-2 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      Loading more…
    </div>
  );
}

export function GridEndMarker({ label = "End of list" }: { label?: string }) {
  return <div className="px-3 py-2 text-center text-[11px] text-muted-foreground">{label}</div>;
}

export function GridErrorState({
  error,
  onRetry,
  onClearFilters,
}: {
  error: unknown;
  onRetry?: () => void;
  onClearFilters?: () => void;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Something went wrong loading this view.";
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
        title="Couldn't load this view"
        description={message}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onRetry && (
              <Button size="sm" variant="default" onClick={onRetry}>
                <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Retry
              </Button>
            )}
            {onClearFilters && (
              <Button size="sm" variant="ghost" onClick={onClearFilters}>
                Reset filters
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}

/**
 * One-stop renderer: pass the query + render-when-ready callback and get
 * a consistent loading / error / empty / data flow. Use the lower-level
 * helpers above when a page needs finer control.
 */
export function GridStates({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onRetry,
  onClearFilters,
  skeletonRows = 12,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  isEmpty: boolean;
  emptyIcon?: ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  onClearFilters?: () => void;
  skeletonRows?: number;
  children: ReactNode;
}) {
  if (isError) {
    return <GridErrorState error={error} onRetry={onRetry} onClearFilters={onClearFilters} />;
  }
  if (isLoading) {
    return <GridSkeletonRows rows={skeletonRows} />;
  }
  if (isEmpty) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }
  return <>{children}</>;
}
