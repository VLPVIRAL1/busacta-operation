import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Power,
  History,
  FolderTree,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROJECT_TYPE_OPTIONS } from "@/lib/shared/domain";
import {
  listFolderTemplates,
  getFolderTemplate,
  createFolderTemplate,
  updateFolderTemplate,
  deactivateFolderTemplate,
  type FolderTemplate,
  type FolderTemplateNode,
} from "@/lib/ops/folder-templates.functions";
import { DeployHistoryDialog } from "@/components/ops/deploy-history-dialog";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/clients/firm/folder-library")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <FolderLibraryPage />
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type NodeDraft = { name: string; children: NodeDraft[] };

function treeToDraft(nodes: FolderTemplateNode[] | undefined): NodeDraft[] {
  return (nodes ?? []).map((n) => ({ name: n.name, children: treeToDraft(n.children) }));
}

function FolderLibraryPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFolderTemplates);
  const deactivateFn = useServerFn(deactivateFolderTemplate);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["folder-library", "all"],
    queryFn: () => listFn({ data: { includeInactive: true, filterToProjectType: false } as any }),
  });

  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);

  const toggleActive = useMutation({
    mutationFn: (t: FolderTemplate) =>
      deactivateFn({ data: { templateId: t.id, isActive: !t.is_active } as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folder-library"] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <PageHeader
        title="Folder Library"
        description="Standardized folder structures for your firm's projects."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/clients">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Firm Hub
              </Link>
            </Button>
            <Button onClick={() => setEditing({})}>
              <Plus className="mr-2 h-4 w-4" />
              New template
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : !templates || templates.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <FolderTree className="mx-auto h-8 w-8 opacity-40 mb-2" />
              No templates yet. Create one to standardize your folder structures.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Project types</TableHead>
                  <TableHead className="text-right">Folders</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id} className={t.is_active ? "" : "opacity-60"}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {t.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.project_types.length === 0 ? (
                          <Badge variant="outline" className="text-[10px]">
                            All
                          </Badge>
                        ) : (
                          t.project_types.map((pt) => (
                            <Badge key={pt} variant="secondary" className="text-[10px]">
                              {pt.replace(/_/g, " ")}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.node_count ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={t.is_active}
                        onCheckedChange={() => toggleActive.mutate(t)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistoryFor({ id: t.id, name: t.name })}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ id: t.id })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editing && <TemplateEditorDialog templateId={editing.id} onClose={() => setEditing(null)} />}

      {historyFor && (
        <DeployHistoryDialog
          open={!!historyFor}
          onOpenChange={(o) => !o && setHistoryFor(null)}
          scope={{ templateId: historyFor.id }}
          title={`History · ${historyFor.name}`}
        />
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Editor dialog with recursive node editor
// ---------------------------------------------------------------------------

function TemplateEditorDialog({
  templateId,
  onClose,
}: {
  templateId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getFolderTemplate);
  const createFn = useServerFn(createFolderTemplate);
  const updateFn = useServerFn(updateFolderTemplate);

  const isEdit = !!templateId;
  const { data: loaded, isLoading } = useQuery({
    queryKey: ["folder-library", "edit", templateId],
    queryFn: () => getFn({ data: { templateId: templateId! } as any }),
    enabled: isEdit,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectTypes, setProjectTypes] = useState<string[]>([]);
  const [nodes, setNodes] = useState<NodeDraft[]>([]);

  // Hydrate when loaded
  const [hydrated, setHydrated] = useState(!isEdit);
  if (isEdit && loaded && !hydrated) {
    setName(loaded.name);
    setDescription(loaded.description ?? "");
    setProjectTypes(loaded.project_types ?? []);
    setNodes(treeToDraft(loaded.nodes));
    setHydrated(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: name.trim(),
        description: description.trim() || null,
        projectTypes,
        nodes,
      };
      if (isEdit) return updateFn({ data: { templateId, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Template updated" : "Template created");
      qc.invalidateQueries({ queryKey: ["folder-library"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleType = (t: string) => {
    setProjectTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit template" : "New template"}</DialogTitle>
        </DialogHeader>

        {isEdit && isLoading ? (
          <div className="py-8 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 1040 Individual Tax"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea
                id="tpl-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Project types{" "}
                <span className="text-xs text-muted-foreground">(leave empty to allow all)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_TYPE_OPTIONS.map((pt) => {
                  const on = projectTypes.includes(pt.value);
                  return (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => toggleType(pt.value)}
                      className={`px-2 py-1 rounded-md text-xs border transition ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                    >
                      {pt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Folder structure</Label>
              <div className="rounded-md border p-2 bg-muted/30">
                <NodeListEditor nodes={nodes} onChange={setNodes} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NodeListEditor({
  nodes,
  onChange,
  depth = 0,
}: {
  nodes: NodeDraft[];
  onChange: (n: NodeDraft[]) => void;
  depth?: number;
}) {
  const [draft, setDraft] = useState("");
  const dupAt = (name: string) =>
    nodes.some((n) => n.name.toLowerCase() === name.trim().toLowerCase());

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (dupAt(v)) {
      toast.error(`"${v}" already exists at this level`);
      return;
    }
    onChange([...nodes, { name: v, children: [] }]);
    setDraft("");
  };
  const updateAt = (i: number, n: NodeDraft) =>
    onChange(nodes.map((x, idx) => (idx === i ? n : x)));
  const removeAt = (i: number) => onChange(nodes.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1">
      {nodes.map((n, i) => (
        <NodeRow
          key={i}
          node={n}
          siblings={nodes.map((s, si) => (si === i ? "" : s.name.toLowerCase()))}
          onChange={(updated) => updateAt(i, updated)}
          onRemove={() => removeAt(i)}
          depth={depth}
        />
      ))}
      <div className="flex gap-1 pt-1" style={{ paddingLeft: depth * 16 }}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={depth === 0 ? "Add top-level folder…" : "Add subfolder…"}
          className="h-7 text-xs"
        />
        <Button size="sm" variant="outline" type="button" onClick={add} className="h-7">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function NodeRow({
  node,
  siblings,
  onChange,
  onRemove,
  depth,
}: {
  node: NodeDraft;
  siblings: string[];
  onChange: (n: NodeDraft) => void;
  onRemove: () => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  const dup = name.trim() && siblings.includes(name.trim().toLowerCase());

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 group" style={{ paddingLeft: depth * 16 }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="p-0.5 hover:bg-muted rounded"
          aria-label="Toggle"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition ${expanded ? "rotate-90" : ""}`} />
        </button>
        <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
        {editing ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const v = name.trim();
              if (v && !dup) {
                onChange({ ...node, name: v });
              } else {
                setName(node.name);
              }
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setName(node.name);
                setEditing(false);
              }
            }}
            className={`h-6 text-xs flex-1 ${dup ? "border-destructive" : ""}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs flex-1 text-left truncate hover:underline"
          >
            {node.name}
          </button>
        )}
        <Button
          size="sm"
          variant="ghost"
          type="button"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {dup && (
        <div className="text-[10px] text-destructive" style={{ paddingLeft: depth * 16 + 24 }}>
          Duplicate name at this level
        </div>
      )}
      {expanded && (
        <NodeListEditor
          nodes={node.children}
          onChange={(c) => onChange({ ...node, children: c })}
          depth={depth + 1}
        />
      )}
    </div>
  );
}
