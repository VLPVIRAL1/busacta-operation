import { useEffect, useMemo, useState } from "react";
import { Folder, FolderTree, Loader2, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/shared/utils";
import { createTaskFolder, listTaskDocuments } from "@/lib/ops/task-documents.functions";
import {
  listFolderTemplates,
  getFolderTemplate,
  deployTemplateToTask,
  type FolderTemplate,
  type FolderTemplateNode,
} from "@/lib/ops/folder-templates.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  activePath: string;
  firmName: string;
  onDeployed?: (paths: string[]) => void;
};

export function NewFolderDialog({
  open,
  onOpenChange,
  taskId,
  activePath,
  firmName,
  onDeployed,
}: Props) {
  const qc = useQueryClient();
  const createFolderFn = useServerFn(createTaskFolder);
  const listTemplatesFn = useServerFn(listFolderTemplates);
  const getTemplateFn = useServerFn(getFolderTemplate);
  const deployFn = useServerFn(deployTemplateToTask);
  const listDocsFn = useServerFn(listTaskDocuments);

  const [tab, setTab] = useState<"custom" | "library">("custom");
  const [customName, setCustomName] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");

  // Templates available for this task's project type
  const templatesQ = useQuery({
    queryKey: ["folder-templates", "task", taskId],
    enabled: open,
    queryFn: () => listTemplatesFn({ data: {} }),
  });

  const templates = templatesQ.data ?? [];

  // Preview the selected template tree
  const selectedQ = useQuery({
    queryKey: ["folder-template", templateId],
    enabled: open && !!templateId,
    queryFn: () => getTemplateFn({ data: { templateId: templateId! } }),
  });

  const selectedTemplate = selectedQ.data ?? null;

  // Existing sibling folder names at the active path (for inline dup validation)
  const docsQ = useQuery({
    queryKey: ["task-documents", taskId],
    enabled: open,
    queryFn: () => listDocsFn({ data: { taskId } }),
  });

  const siblingNames = useMemo(() => {
    const folders = docsQ.data?.folders ?? [];
    const prefix = activePath ? `${activePath}/` : "";
    const out = new Set<string>();
    for (const f of folders) {
      if (activePath) {
        if (f.path.startsWith(prefix)) {
          const rest = f.path.slice(prefix.length);
          if (rest && !rest.includes("/")) out.add(rest.toLowerCase());
        }
      } else {
        const top = f.path.split("/")[0];
        if (top) out.add(top.toLowerCase());
      }
    }
    return out;
  }, [docsQ.data, activePath]);

  const targetLabel = activePath ? `/${activePath}` : `/ (${firmName})`;

  const trimmed = customName.trim();
  const dupError =
    trimmed && siblingNames.has(trimmed.toLowerCase())
      ? `A folder named "${trimmed}" already exists here`
      : null;
  const invalidChar = /[\/\\]/.test(trimmed) ? "Name cannot contain slashes" : null;
  const customError = dupError || invalidChar;

  const reset = () => {
    setCustomName("");
    setTemplateId(null);
    setMode("merge");
    setTab("custom");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  // Auto-select first template when list loads
  useEffect(() => {
    if (!templateId && templates.length > 0) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["task-documents", taskId] });

  const mCustom = useMutation({
    mutationFn: (name: string) => createFolderFn({ data: { taskId, parent: activePath, name } }),
    onSuccess: () => {
      invalidate();
      toast.success("Folder created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDeploy = useMutation({
    mutationFn: () =>
      deployFn({
        data: {
          taskId,
          templateId: templateId!,
          basePath: activePath,
          mode,
        },
      }),
    onSuccess: (res) => {
      invalidate();
      const label = selectedTemplate?.name ?? "Template";
      const extra = res.foldersSkipped ? ` (${res.foldersSkipped} skipped)` : "";
      toast.success(`Deployed "${label}" — ${res.foldersCreated} folders created${extra}`);
      onDeployed?.([]);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogDescription>
            Will be created inside: <span className="font-mono text-foreground">{targetLabel}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "custom" | "library")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="custom">
              <Folder className="h-4 w-4" />
              Custom Folder
            </TabsTrigger>
            <TabsTrigger value="library">
              <Sparkles className="h-4 w-4" />
              From Library
            </TabsTrigger>
          </TabsList>

          {/* Custom */}
          <TabsContent value="custom" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Folder name</Label>
              <Input
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Source Documents"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && trimmed && !customError) {
                    mCustom.mutate(trimmed);
                  }
                }}
                aria-invalid={!!customError}
              />
              {customError && <p className="text-xs text-destructive">{customError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={!trimmed || !!customError || mCustom.isPending}
                onClick={() => mCustom.mutate(trimmed)}
              >
                {mCustom.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Library */}
          <TabsContent value="library" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
              <div className="rounded-md border">
                <Command>
                  <CommandInput placeholder="Search templates..." />
                  <CommandList className="max-h-[320px]">
                    {templatesQ.isLoading ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                      </div>
                    ) : (
                      <>
                        <CommandEmpty>
                          No templates available. Ask an admin to create one in the Folder Library.
                        </CommandEmpty>
                        <CommandGroup heading="Templates">
                          {templates.map((t) => (
                            <CommandItem
                              key={t.id}
                              value={t.name}
                              onSelect={() => setTemplateId(t.id)}
                              className={cn(
                                "flex flex-col items-start gap-0.5",
                                t.id === templateId && "bg-accent",
                              )}
                            >
                              <div className="flex w-full items-center justify-between">
                                <span className="font-medium">{t.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {t.node_count ?? 0} folders
                                </span>
                              </div>
                              {t.description && (
                                <span className="text-xs text-muted-foreground">
                                  {t.description}
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </div>

              <div className="rounded-md border bg-muted/30 p-3">
                {selectedQ.isLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : selectedTemplate ? (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FolderTree className="h-4 w-4" />
                        Preview: {selectedTemplate.name}
                      </div>
                    </div>
                    <div className="max-h-[240px] overflow-auto rounded bg-background p-2 font-mono text-sm">
                      {selectedTemplate.nodes?.length ? (
                        <TreePreview nodes={selectedTemplate.nodes} depth={0} />
                      ) : (
                        <p className="text-xs text-muted-foreground">Template has no folders.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Select a template to preview.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <Label className="mb-2 block text-xs">Deployment mode</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as "merge" | "replace")}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                <label className="flex items-start gap-2 rounded-md border bg-background p-2 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="merge" id="mode-merge" />
                  <div>
                    <div className="text-sm font-medium">Merge</div>
                    <div className="text-xs text-muted-foreground">
                      Add template folders; keep existing folders and files.
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-md border bg-background p-2 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="replace" id="mode-replace" />
                  <div>
                    <div className="text-sm font-medium">Replace</div>
                    <div className="text-xs text-muted-foreground">
                      Archive existing files under template root folders before deploying.
                    </div>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!templateId || mDeploy.isPending} onClick={() => mDeploy.mutate()}>
                {mDeploy.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Deploy Template
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function TreePreview({ nodes, depth }: { nodes: FolderTemplateNode[]; depth: number }) {
  return (
    <ul className="space-y-1">
      {nodes.map((n) => (
        <li key={n.id}>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 16 }}>
            <Folder className="h-3.5 w-3.5 text-indigo-500" />
            <span>{n.name}</span>
          </div>
          {n.children?.length ? <TreePreview nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}
