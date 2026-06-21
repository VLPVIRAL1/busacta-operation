import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyNotesEditor } from "@/components/global-dashboard/daily-notes-editor";
import { useAuth } from "@/lib/auth/auth-context";
import { trainingNoteQuery } from "@/lib/queries/learning.queries";
import { upsertTrainingNote } from "@/lib/learning/notes.functions";

interface Props {
  courseId?: string | null;
  sharepointItemId?: string | null;
}

export function TrainingNotesPanel({ courseId, sharepointItemId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const noteQ = useQuery(
    trainingNoteQuery(user?.id, {
      courseId: courseId ?? null,
      spItemId: sharepointItemId ?? null,
    }),
  );

  const saveMut = useMutation({
    mutationFn: (content: unknown) =>
      upsertTrainingNote({
        data: {
          courseId: courseId ?? null,
          sharepointItemId: sharepointItemId ?? null,
          content,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-note"] });
    },
    onError: (e: Error) => toast.error(`Note save failed: ${e.message}`),
  });

  if (noteQ.isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          My Notes
        </span>
        {saveMut.isSuccess && noteQ.data?.updated_at && (
          <span className="text-[10px] text-muted-foreground">
            Saved {format(new Date(noteQ.data.updated_at), "h:mm a")}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <DailyNotesEditor
          initialContent={noteQ.data?.content ?? null}
          resetKey={noteQ.data?.id ?? `${courseId ?? sharepointItemId ?? "new"}`}
          onSave={(content) => saveMut.mutate(content)}
        />
      </div>
    </div>
  );
}
