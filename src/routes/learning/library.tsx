import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, CheckCircle2, Monitor } from "lucide-react";
import { z } from "zod";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrainingNotesPanel } from "@/components/learning/training-notes-panel";
import { useAuth } from "@/lib/auth/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { markAssignmentComplete } from "@/lib/learning/assignments.functions";

const searchSchema = z.object({
  itemId: z.string(),
  driveId: z.string(),
  name: z.string(),
});

export const Route = createFileRoute("/learning/library")({
  validateSearch: searchSchema,
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[
          { label: "Learning & Training", to: "/learning" },
          { label: "Training Hub", to: "/learning/courses" },
          { label: "Library" },
        ]}
      >
        <LibraryViewer />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/webm",
  "video/mpeg",
]);

function isVideoMime(mime: string) {
  return VIDEO_TYPES.has(mime) || mime.startsWith("video/");
}

function isVideoName(name: string) {
  return /\.(mp4|mov|avi|wmv|webm|mpeg|mpg)$/i.test(name);
}

function LibraryViewer() {
  const { itemId, driveId, name } = Route.useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [studyMode, setStudyMode] = useState(false);

  const isVideo = isVideoName(name);
  const STORAGE_KEY = "learning.library.pane";

  const toggleStudyMode = () => {
    if (!studyMode) {
      window.dispatchEvent(
        new CustomEvent("wi-pane:set", {
          detail: { storageKey: STORAGE_KEY, value: 85 },
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("wi-pane:reset", {
          detail: { storageKey: STORAGE_KEY },
        }),
      );
    }
    setStudyMode((v) => !v);
  };

  // Find assignment for mark-complete
  const completeMut = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not signed in");
      // Find assignment by course name match (best effort — no courseId on file items)
      const { data } = await supabase
        .from("training_assignments")
        .select("id, status")
        .eq("employee_id", user.id)
        .neq("status", "completed")
        .limit(50);

      const assignments = data ?? [];
      const target = assignments[0];
      if (!target) throw new Error("No pending assignment found for this training");

      return markAssignmentComplete({ data: { assignmentId: target.id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
      toast.success("Marked as complete!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const contentPane = (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between px-1 py-2 border-b mb-2 shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {isVideo ? "Video" : "Document"}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {isVideo ? "Video" : "PDF"}
        </Badge>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden rounded-md border bg-black/5">
        {isVideo ? (
          <video
            key={itemId}
            src={`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`}
            controls
            className="w-full h-full object-contain"
            preload="metadata"
          />
        ) : (
          <iframe
            key={itemId}
            src={`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`}
            className="w-full h-full border-0"
            title={name}
          />
        )}
      </div>
    </div>
  );

  const notesPane = <TrainingNotesPanel sharepointItemId={itemId} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/learning/courses" search={{ tab: "library" } as never}>
          <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs">
            <ArrowLeft className="h-3 w-3" /> Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <PageHeader
            title={name}
            description="Watch the video or read the document, and take notes on the right."
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant={studyMode ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={toggleStudyMode}
          >
            {studyMode ? (
              <>
                <Monitor className="h-3 w-3" /> Show Video
              </>
            ) : (
              <>
                <BookOpen className="h-3 w-3" /> Study Mode
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={completeMut.isPending}
            onClick={() => completeMut.mutate()}
          >
            <CheckCircle2 className="h-3 w-3" />
            {completeMut.isPending ? "Saving…" : "Mark Complete"}
          </Button>
        </div>
      </div>

      <ResizableTwoPane
        storageKey={STORAGE_KEY}
        defaultLeft={62}
        minLeft={20}
        maxLeft={85}
        hideToolbar
        left={contentPane}
        right={notesPane}
      />
    </div>
  );
}
