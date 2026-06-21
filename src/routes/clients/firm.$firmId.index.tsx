import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  FolderKanban,
  ExternalLink,
  User,
  Users,
  UsersRound,
  FileText,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { coloredTabsListClass, coloredTabTrigger } from "@/lib/ui/colored-tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { useFirmRealtime } from "@/hooks/use-firm-realtime";
import {
  PROJECT_TYPE_OPTIONS,
  defaultSkipEntityForProjectType,
  type ProjectType,
} from "@/lib/shared/domain";

import { RichEditor, RichViewer } from "@/components/shared/rich-editor";
import { ClientProfileTab } from "@/components/client-hub/client-profile-tab";
import { ClientDocumentsTab } from "@/components/client-hub/client-documents-tab";
import { ClientContactsTab } from "@/components/client-hub/client-contacts-tab";
import { ClientTeamTab } from "@/components/client-hub/client-team-tab";
import { firmAdapter } from "@/lib/client-hub/adapter";

import { stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { firmDetailDefaults, firmDetailSearchSchema } from "./_search";

export const Route = createFileRoute("/clients/firm/$firmId/")({
  validateSearch: zodValidator(firmDetailSearchSchema),
  search: {
    middlewares: [stripSearchParams({ tab: firmDetailDefaults.tab })],
  },
  component: () => (
    <AuthGuard allow={["super_admin"]}>
      <FirmShell />
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

// FEATURE_MATRIX is now imported from @/lib/shared/firm-features (single source of truth).

// Per-employee internal access uses the same FEATURE_MATRIX keys (with `.internal` suffix omitted —
// stored simply as the feature key in firm_member_capabilities).

function FirmShell() {
  const { firmId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  useFirmRealtime(firmId);

  const { data: firm, isLoading } = useQuery({
    queryKey: ["firm-hub-firm", firmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firms")
        .select("*")
        .eq("id", firmId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading)
    return (
      <AppShell crumbs={[{ label: "Admin" }, { label: "B2B Firm Hub" }]}>
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  if (!firm)
    return (
      <AppShell crumbs={[{ label: "Admin" }, { label: "B2B Firm Hub" }]}>
        <div className="p-8">Firm not found.</div>
      </AppShell>
    );

  return (
    <AppShell
      crumbs={[{ label: "Admin" }, { label: "B2B Firm Hub", to: "/clients" }, { label: firm.name }]}
    >
      <PageHeader
        title={firm.name}
        description={
          <span className="flex items-center gap-2">
            <Badge variant={firm.status === "deactivated" ? "destructive" : "default"}>
              {firm.status}
            </Badge>
            {firm.contact_email && (
              <span className="text-xs text-muted-foreground">{firm.contact_email}</span>
            )}
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/clients/firm/folder-library">
                <FolderKanban className="mr-2 h-4 w-4" />
                Folder Library
              </Link>
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/clients" })}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      <FirmTabsLazy
        firm={firm}
        firmId={firmId}
        tab={tab}
        onTabChange={(t) =>
          navigate({
            to: "/clients/firm/$firmId",
            params: { firmId },
            search: (prev: Record<string, unknown>) => ({ ...prev, tab: t }),
            replace: true,
          })
        }
      />
    </AppShell>
  );
}

/**
 * Render only the active tab's body. Mounting all tabs upfront caused 6
 * parallel Supabase queries on every Firm Hub open and made the app feel slow.
 */
type FirmTab = "profile" | "contacts" | "team" | "projects" | "documents";

export function FirmTabsLazy({
  firm,
  firmId,
  tab: controlledTab,
  onTabChange,
}: {
  firm: any;
  firmId: string;
  tab?: FirmTab;
  onTabChange?: (t: FirmTab) => void;
}) {
  const [localTab, setLocalTab] = useState<FirmTab>("profile");
  const tab = controlledTab ?? localTab;
  const setTab = (t: FirmTab) => {
    if (onTabChange) onTabChange(t);
    else setLocalTab(t);
  };
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as FirmTab)} className="space-y-4">
      <div className="border-b">
        <TabsList className={coloredTabsListClass}>
          <TabsTrigger value="profile" className={coloredTabTrigger(0)}>
            <User className="h-3.5 w-3.5 mr-1.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="contacts" className={coloredTabTrigger(1)}>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="team" className={coloredTabTrigger(2)}>
            <UsersRound className="h-3.5 w-3.5 mr-1.5" />
            Team & Access
          </TabsTrigger>
          <TabsTrigger value="projects" className={coloredTabTrigger(3)}>
            <FolderKanban className="h-3.5 w-3.5 mr-1.5" />
            Projects
          </TabsTrigger>
          <TabsTrigger value="documents" className={coloredTabTrigger(4)}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Documents
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent
        value="profile"
        forceMount={tab === "profile" ? true : undefined}
        hidden={tab !== "profile"}
      >
        {tab === "profile" && <ClientProfileTab adapter={firmAdapter} entity={firm} />}
      </TabsContent>
      <TabsContent value="contacts" hidden={tab !== "contacts"}>
        {tab === "contacts" && <ClientContactsTab adapter={firmAdapter} entityId={firmId} />}
      </TabsContent>
      <TabsContent value="team" hidden={tab !== "team"}>
        {tab === "team" && <ClientTeamTab adapter={firmAdapter} entityId={firmId} />}
      </TabsContent>
      <TabsContent value="projects" hidden={tab !== "projects"}>
        {tab === "projects" && <ProjectsTab firmId={firmId} />}
      </TabsContent>
      <TabsContent value="documents" hidden={tab !== "documents"}>
        {tab === "documents" && <ClientDocumentsTab adapter={firmAdapter} entityId={firmId} />}
      </TabsContent>
    </Tabs>
  );
}

/* -------------------- PROJECTS -------------------- */
type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  project_type: ProjectType;
  status: string;
  description: string | null;
  created_at: string;
  project_feature_toggles: { skip_entity_hierarchy: boolean | null }[] | null;
};

function ProjectsTab({ firmId }: { firmId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<ProjectType>("other");
  const [desc, setDesc] = useState("");
  const [skipEntity, setSkipEntity] = useState<boolean>(defaultSkipEntityForProjectType("other"));

  useEffect(() => {
    setSkipEntity(defaultSkipEntityForProjectType(type));
  }, [type]);

  const { data: projects = [] } = useQuery<ProjectRow[]>({
    queryKey: ["firm-projects", firmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, name, code, project_type, status, description, created_at, project_feature_toggles(skip_entity_hierarchy)",
        )
        .eq("firm_id", firmId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["firm-projects", firmId] });

  const updateField = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ProjectRow, "name" | "code" | "description" | "status">>;
    }) => {
      const { error } = await supabase.from("projects").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      invalidate();
    },
  });

  const toggleSkipEntity = useMutation({
    mutationFn: async ({ projectId, next }: { projectId: string; next: boolean }) => {
      const { error } = await supabase
        .from("project_feature_toggles")
        .upsert(
          { project_id: projectId, skip_entity_hierarchy: next },
          { onConflict: "project_id" },
        );
      if (error) throw error;
      if (next) {
        await supabase.rpc(
          "ensure_project_default_entity" as never,
          { _project_id: projectId } as never,
        );
      }
    },
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Project name is required");
      const codeUp = code.trim().toUpperCase();
      if (!/^[A-Z0-9-]{2,12}$/.test(codeUp)) {
        throw new Error("Project code is required (2–12 uppercase letters, digits, or dashes)");
      }
      const { data, error } = await supabase
        .from("projects")
        .insert({
          firm_id: firmId,
          name: name.trim(),
          code: codeUp,
          project_type: type,
          description: desc || null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const projectId = data.id as string;
      const expected = defaultSkipEntityForProjectType(type);
      if (skipEntity !== expected) {
        await supabase
          .from("project_feature_toggles")
          .upsert(
            { project_id: projectId, skip_entity_hierarchy: skipEntity },
            { onConflict: "project_id" },
          );
        if (skipEntity) {
          await supabase.rpc(
            "ensure_project_default_entity" as never,
            { _project_id: projectId } as never,
          );
        }
      }
      return projectId;
    },
    onSuccess: (id) => {
      toast.success("Project created");
      setOpen(false);
      setName("");
      setCode("");
      setDesc("");
      invalidate();
      window.location.href = `/clients/${firmId}/projects/${id}`;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Projects</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Project name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label>Project code *</Label>
                  <Input
                    value={code}
                    onChange={(e) =>
                      setCode(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9-]/g, "")
                          .slice(0, 12),
                      )
                    }
                    placeholder="e.g. ACME-25"
                    className="font-mono uppercase"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    2–12 chars, A–Z 0–9 dashes. Editable anytime.
                  </p>
                </div>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description / notes</Label>
                <RichEditor
                  value={desc}
                  onChange={setDesc}
                  placeholder="Optional notes about this project…"
                  minHeight={140}
                />
              </div>
              <div className="flex items-start justify-between rounded-md border p-3 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">Skip Client Entity layer</div>
                  <div className="text-xs text-muted-foreground">
                    {skipEntity
                      ? "Tasks will attach directly to the project (no entity grouping)."
                      : "Tasks must be assigned to a Client Entity within this project."}
                  </div>
                </div>
                <Switch checked={skipEntity} onCheckedChange={setSkipEntity} />
              </div>
              <p className="text-xs text-muted-foreground">
                A default 5-stage pipeline will be created automatically. You can customize it after
                creation.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                Create & open
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center">
            <FolderKanban className="mx-auto h-8 w-8 opacity-40 mb-2" />
            No projects yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[140px]">Type</TableHead>
                <TableHead>Description / Notes</TableHead>
                <TableHead className="w-[140px] text-center">Skip Entity Layer</TableHead>
                <TableHead className="w-[110px] text-center">Active</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <ProjectInlineRow
                  key={p.id}
                  firmId={firmId}
                  project={p}
                  onSaveField={(patch) => updateField.mutate({ id: p.id, patch })}
                  onToggleSkipEntity={(next) => toggleSkipEntity.mutate({ projectId: p.id, next })}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectInlineRow({
  firmId,
  project,
  onSaveField,
  onToggleSkipEntity,
}: {
  firmId: string;
  project: ProjectRow;
  onSaveField: (
    patch: Partial<Pick<ProjectRow, "name" | "code" | "description" | "status">>,
  ) => void;
  onToggleSkipEntity: (next: boolean) => void;
}) {
  const [code, setCode] = useState(project.code ?? "");
  const [name, setName] = useState(project.name ?? "");
  const [descOpen, setDescOpen] = useState(false);
  const [descDraft, setDescDraft] = useState(project.description ?? "");
  useEffect(() => {
    setCode(project.code ?? "");
  }, [project.code]);
  useEffect(() => {
    setName(project.name ?? "");
  }, [project.name]);
  useEffect(() => {
    if (descOpen) setDescDraft(project.description ?? "");
  }, [descOpen, project.description]);

  const isActive = project.status === "active";
  const skipEntity =
    project.project_feature_toggles?.[0]?.skip_entity_hierarchy ??
    defaultSkipEntityForProjectType(project.project_type);
  const ptLabel =
    PROJECT_TYPE_OPTIONS.find((o) => o.value === project.project_type)?.label ??
    project.project_type.replace(/_/g, " ");

  const commitCode = () => {
    const next = code.trim().toUpperCase();
    if (next === (project.code ?? "")) return;
    if (!/^[A-Z0-9-]{2,12}$/.test(next)) {
      toast.error("Code must be 2–12 chars, A–Z 0–9 dashes");
      setCode(project.code ?? "");
      return;
    }
    onSaveField({ code: next });
  };
  const commitName = () => {
    const next = name.trim();
    if (!next) {
      toast.error("Project name is required");
      setName(project.name ?? "");
      return;
    }
    if (next === (project.name ?? "")) return;
    onSaveField({ name: next });
  };
  const saveDesc = () => {
    onSaveField({ description: (descDraft?.trim() ? descDraft : null) as any });
    setDescOpen(false);
  };

  return (
    <TableRow className={isActive ? "" : "opacity-60"}>
      <TableCell>
        <Input
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9-]/g, "")
                .slice(0, 12),
            )
          }
          onBlur={commitCode}
          className="h-8 font-mono uppercase text-xs"
          placeholder="CODE"
        />
      </TableCell>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          className="h-8 text-sm font-medium"
          placeholder="Project name"
        />
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize text-[10px]">
          {ptLabel}
        </Badge>
      </TableCell>
      <TableCell>
        <Dialog open={descOpen} onOpenChange={setDescOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="w-full text-left rounded border border-input bg-background hover:bg-muted/40 px-2 py-1.5 min-h-[32px] text-xs cursor-pointer"
            >
              {project.description ? (
                <RichViewer html={project.description} className="line-clamp-2 text-xs" />
              ) : (
                <span className="text-muted-foreground italic">Add notes…</span>
              )}
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Description / Notes — {project.name}</DialogTitle>
            </DialogHeader>
            <RichEditor
              value={descDraft ?? ""}
              onChange={setDescDraft}
              placeholder="Add a rich description, notes, or context for this project…"
              minHeight={240}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setDescOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveDesc}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
      <TableCell className="text-center">
        <Switch checked={skipEntity} onCheckedChange={onToggleSkipEntity} />
      </TableCell>
      <TableCell className="text-center">
        <Switch
          checked={isActive}
          onCheckedChange={(v) => onSaveField({ status: v ? "active" : "paused" })}
        />
      </TableCell>
      <TableCell>
        <Button asChild size="icon" variant="ghost" title="Open project">
          <Link
            to="/clients/firm/$firmId/projects/$projectId"
            params={{ firmId, projectId: project.id }}
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
