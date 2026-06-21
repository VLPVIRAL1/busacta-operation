import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderTree, History, Play, Library } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listFolderTemplates,
  applyTemplateToProjectTasks,
} from "@/lib/ops/folder-templates.functions";
import { DeployHistoryDialog } from "@/components/ops/deploy-history-dialog";

export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const listFn = useServerFn(listFolderTemplates);
  const applyFn = useServerFn(applyTemplateToProjectTasks);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["project-templates", projectId],
    queryFn: () => listFn({ data: { projectId } as any }),
  });

  const [templateId, setTemplateId] = useState<string>("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const apply = useMutation({
    mutationFn: () => applyFn({ data: { projectId, templateId, mode } as any }),
    onSuccess: (r: any) => {
      toast.success(`Applied to ${r.tasksTouched} task(s) · ${r.foldersCreated} folders created`);
      setConfirmOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = templates?.find((t) => t.id === templateId);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <FolderTree className="h-4 w-4" /> Apply folder template to all tasks
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Deploy a standardized folder structure across every task in this project.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
                <History className="mr-2 h-4 w-4" /> History
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/clients/firm/folder-library">
                  <Library className="mr-2 h-4 w-4" />
                  Manage library
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoading ? "Loading…" : "Choose a template"} />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.node_count ?? 0} folders
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected?.project_types && selected.project_types.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {selected.project_types.map((pt) => (
                    <Badge key={pt} variant="secondary" className="text-[10px]">
                      {pt.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Deployment mode</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as "merge" | "replace")}>
                <div className="flex items-start gap-2 rounded-md border p-2.5">
                  <RadioGroupItem value="merge" id="mode-merge" className="mt-0.5" />
                  <Label htmlFor="mode-merge" className="flex-1 cursor-pointer font-normal">
                    <div className="text-sm font-medium">Merge</div>
                    <div className="text-xs text-muted-foreground">
                      Keep existing folders & files; add missing ones.
                    </div>
                  </Label>
                </div>
                <div className="flex items-start gap-2 rounded-md border p-2.5">
                  <RadioGroupItem value="replace" id="mode-replace" className="mt-0.5" />
                  <Label htmlFor="mode-replace" className="flex-1 cursor-pointer font-normal">
                    <div className="text-sm font-medium text-destructive">Replace</div>
                    <div className="text-xs text-muted-foreground">
                      Archive existing files & remove folders at template paths first.
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => (mode === "replace" ? setConfirmOpen(true) : apply.mutate())}
              disabled={!templateId || apply.isPending}
            >
              <Play className="mr-2 h-4 w-4" />
              {apply.isPending ? "Applying…" : "Apply to all tasks"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing folder structure?</AlertDialogTitle>
            <AlertDialogDescription>
              All files inside the template's folders will be archived and the folders themselves
              removed before the template is deployed. This affects every task in the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => apply.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeployHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        scope={{ projectId }}
        title="Project deployment history"
      />
    </div>
  );
}
