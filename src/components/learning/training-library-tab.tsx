import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Video, FileText, ExternalLink, RefreshCw, Library } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { AssignAsTaskButton } from "./assign-as-task-button";
import { listTrainingFilesServerFn } from "@/lib/learning/sharepoint.functions";
import type { TrainingFileItem } from "@/lib/sharepoint/training-files.server";

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/webm",
  "video/mpeg",
]);

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TrainingLibraryTab() {
  const navigate = useNavigate();

  const filesQ = useQuery({
    queryKey: ["training-sp-files"],
    queryFn: () => listTrainingFilesServerFn({ data: {} }),
    staleTime: 45 * 60 * 1000,
    retry: 1,
  });

  const files = (filesQ.data ?? []) as TrainingFileItem[];

  if (filesQ.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (filesQ.isError) {
    const err = filesQ.error instanceof Error ? filesQ.error.message : "Unknown error";
    const isNotConfigured = err.includes("not configured");

    return (
      <EmptyState
        icon={<Library className="h-8 w-8" />}
        title={isNotConfigured ? "SharePoint not configured" : "Could not load training files"}
        description={
          isNotConfigured
            ? "Configure Microsoft Graph credentials in Admin → Integrations to sync SharePoint training content."
            : err
        }
        action={
          !isNotConfigured ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => filesQ.refetch()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<Library className="h-8 w-8" />}
        title="No training files found"
        description='Upload videos or PDFs to your configured SharePoint training folder (default: "Training") to see them here.'
        action={
          <Button size="sm" variant="outline" onClick={() => filesQ.refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {files.length} file{files.length !== 1 ? "s" : ""} in SharePoint Training folder
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => filesQ.refetch()}
          className="gap-1.5 h-7 text-xs"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {files.map((file) => (
          <TrainingFileCard
            key={file.id}
            file={file}
            onOpen={() =>
              navigate({
                to: "/learning/library",
                search: { itemId: file.id, driveId: file.driveId, name: file.name },
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function TrainingFileCard({ file, onOpen }: { file: TrainingFileItem; onOpen: () => void }) {
  const isVideo = VIDEO_TYPES.has(file.mimeType);

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors group">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md flex items-center justify-center shrink-0 bg-primary/10 text-primary ring-1 ring-primary/20">
          {isVideo ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm leading-snug line-clamp-2">{file.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[10px]">
              {isVideo ? "Video" : "PDF"}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{humanSize(file.size)}</span>
          </div>
          {file.lastModified && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {formatDistanceToNow(new Date(file.lastModified), { addSuffix: true })}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-auto">
        <Button size="sm" className="flex-1 h-7 text-xs" onClick={onOpen}>
          Open
        </Button>
        <a href={file.webUrl} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Open in SharePoint">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>
        <AssignAsTaskButton courseTitle={file.name} size="sm" variant="ghost" />
      </div>
    </div>
  );
}
