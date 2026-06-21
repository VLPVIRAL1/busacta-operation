import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Route as RouteIcon } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PathBuilder } from "@/components/learning/path-builder";
import { useAuth } from "@/lib/auth/auth-context";
import { useFirmId, trainingPathsQuery, type TrainingPath } from "@/lib/queries/learning.queries";
import { createPath } from "@/lib/learning/paths.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/learning/paths")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[{ label: "Learning & Training", to: "/learning" }, { label: "Training Paths" }]}
      >
        <PathsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function PathsPage() {
  const firmId = useFirmId();
  const { role, user } = useAuth();
  const isManager = !!role && ["admin", "super_admin", "hr_manager"].includes(role);

  const pathsQ = useQuery(trainingPathsQuery(firmId));

  const coursesQ = useQuery({
    queryKey: ["training-courses-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_courses")
        .select("id, title, category, provider, cpe_credits")
        .order("title");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        title: string;
        category: string;
        provider: string | null;
        cpe_credits: number | null;
      }[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // For progress tracking: employee's completed course IDs
  const myCompletionsQ = useQuery({
    queryKey: ["my-completions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("training_assignments")
        .select("course_id")
        .eq("employee_id", user!.id)
        .eq("status", "completed");
      return new Set((data ?? []).map((r) => (r as { course_id: string }).course_id));
    },
    staleTime: 5 * 60 * 1000,
  });

  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);

  const paths = pathsQ.data ?? [];
  const selectedPath = paths.find((p) => p.id === selectedPathId) ?? paths[0] ?? null;

  if (!selectedPathId && paths.length > 0) {
    setSelectedPathId(paths[0].id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Training Paths"
          description="Curated learning curricula — staff complete courses in order."
        />
        {isManager && firmId && <CreatePathDialog firmId={firmId} />}
      </div>

      {pathsQ.isLoading ? (
        <div className="grid md:grid-cols-[35%_65%] grid-cols-1 gap-0 border rounded-lg">
          <Skeleton className="h-64" />
        </div>
      ) : paths.length === 0 ? (
        <EmptyState
          icon={<RouteIcon className="h-8 w-8" />}
          title="No training paths yet"
          description={
            isManager
              ? "Create a path to build a structured curriculum for your team."
              : "No training paths have been created yet."
          }
          action={isManager && firmId ? <CreatePathDialog firmId={firmId} /> : undefined}
        />
      ) : (
        <div className="h-[calc(100svh-260px)] min-h-[480px] grid md:grid-cols-[35%_65%] grid-cols-1 border rounded-lg overflow-hidden">
          {/* Left — path list */}
          <div className="min-h-0 border-r overflow-y-auto">
            <ul className="divide-y">
              {paths.map((path) => (
                <PathListItem
                  key={path.id}
                  path={path}
                  selected={path.id === selectedPath?.id}
                  onClick={() => setSelectedPathId(path.id)}
                />
              ))}
            </ul>
          </div>
          {/* Right — path detail */}
          <div className="min-h-0 overflow-y-auto p-5">
            {selectedPath ? (
              <div className="space-y-1 mb-4">
                <h2 className="font-semibold text-base">{selectedPath.title}</h2>
                {selectedPath.description && (
                  <p className="text-sm text-muted-foreground">{selectedPath.description}</p>
                )}
              </div>
            ) : null}
            {selectedPath && (
              <PathBuilder
                path={selectedPath}
                allCourses={coursesQ.data ?? []}
                myCompletedCourseIds={myCompletionsQ.data}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PathListItem({
  path,
  selected,
  onClick,
}: {
  path: TrainingPath;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selected ? "bg-muted/70 border-l-2 border-l-primary" : ""}`}
        onClick={onClick}
      >
        <div className="font-medium text-sm">{path.title}</div>
        {path.description && (
          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {path.description}
          </div>
        )}
      </button>
    </li>
  );
}

function CreatePathDialog({ firmId }: { firmId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const mut = useMutation({
    mutationFn: () => createPath({ data: { firmId, title, description } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-paths"] });
      toast.success("Training path created");
      setOpen(false);
      setTitle("");
      setDescription("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Path
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Training Path</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New Staff Onboarding"
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px] text-sm resize-none"
              placeholder="What will staff learn?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!title.trim() || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
