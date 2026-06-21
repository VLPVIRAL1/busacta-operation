import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/shared/utils";

interface ScreenshotViewerProps {
  signedUrl: string | null;
  isLoading?: boolean;
}

export function ScreenshotViewer({ signedUrl, isLoading = false }: ScreenshotViewerProps) {
  const [revealed, setRevealed] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  if (!signedUrl) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border bg-muted/30">
        <p className="text-sm text-muted-foreground">No screenshot captured for this interval</p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border bg-muted/30">
        <p className="text-sm text-muted-foreground">Screenshot unavailable</p>
      </div>
    );
  }

  return (
    <div
      className="relative cursor-pointer overflow-hidden rounded-lg"
      onClick={() => setRevealed((prev) => !prev)}
    >
      <img
        src={signedUrl}
        alt="Activity screenshot"
        className={cn("w-full rounded-lg object-cover max-h-72", !revealed && "blur-sm")}
        onError={() => setHasError(true)}
      />
      {!revealed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-background/80 px-3 py-1.5 text-sm font-medium backdrop-blur-sm">
            Click to reveal
          </span>
        </div>
      )}
    </div>
  );
}
