import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, Component, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Feather,
  Brain,
  Puzzle,
  Layers,
  Network,
  Gauge,
  Sigma,
  Turtle,
  Clock,
  Zap,
  Flame,
  AlarmClock,
  Timer,
  Bell,
  Siren,
  FolderOpen,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import {
  saveSharePointProjectLibrary,
  getProjectSharePointStatus,
} from "@/lib/sharepoint/sharepoint.functions";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/lib/auth/auth-context";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

import { MultiSoftwareSelect } from "@/components/shared/multi-software-select";
import { SOFTWARE_OPTIONS, labelFor, type SoftwareType } from "@/lib/shared/domain";
import { CurrencyPicker } from "@/components/shared/currency-picker";
import { PricingPeriodsTab } from "@/components/firm-hub/pricing-tab";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/clients/firm/$firmId/projects/$projectId")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <ProjectShell />
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

class TabBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[TabBoundary]", this.props.name, error);
  }
  render() {
    if (this.state.error) {
      return (
        <Card>
          <CardContent className="py-6 text-sm">
            <div className="font-medium text-destructive mb-1">{this.props.name} couldn't load</div>
            <div className="text-muted-foreground text-xs">{this.state.error.message}</div>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => this.setState({ error: null })}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

const MAJOR_STAGES = [
  {
    value: "with_bat",
    label: "With BAT",
    tone: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  {
    value: "with_cpa",
    label: "With CPA",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    value: "on_hold",
    label: "On Hold",
    tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  {
    value: "completed",
    label: "Completed",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
] as const;

const PROJECT_TYPE_PRESETS: Record<
  string,
  Array<{ key: string; label: string; field_type: string; options: string[] }>
> = {
  bookkeeping: [
    {
      key: "frequency",
      label: "Frequency",
      field_type: "select",
      options: ["Monthly", "Quarterly", "Annual"],
    },
  ],
  audit: [
    {
      key: "audit_type",
      label: "Audit Type",
      field_type: "select",
      options: ["Financial", "Compliance", "Operational"],
    },
  ],
  payroll: [
    {
      key: "pay_frequency",
      label: "Pay Frequency",
      field_type: "select",
      options: ["Weekly", "Bi-weekly", "Monthly"],
    },
  ],
};

function ProjectShell() {
  const { firmId, projectId } = Route.useParams();
  const navigate = useNavigate();

  const { data: project, isLoading } = useQuery({
    queryKey: ["fh-project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, firms(name)")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading)
    return (
      <AppShell crumbs={[{ label: "B2B Firm Hub", to: "/clients" }]}>
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  if (!project)
    return (
      <AppShell crumbs={[{ label: "B2B Firm Hub", to: "/clients" }]}>
        <div className="p-8">Project not found.</div>
      </AppShell>
    );
  if (project.firm_id !== firmId) {
    return (
      <AppShell crumbs={[{ label: "B2B Firm Hub", to: "/clients" }]}>
        <div className="p-8 space-y-3">
          <div className="text-sm">This project does not belong to the firm in the URL.</div>
          <Button asChild variant="outline" size="sm">
            <a href={`/clients/${project.firm_id}/projects/${projectId}`}>Open in correct firm</a>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      crumbs={[
        { label: "B2B Firm Hub", to: "/clients" },
        { label: project.firms?.name ?? "Firm", to: `/clients/${firmId}` },
        { label: project.name },
      ]}
    >
      <PageHeader
        title={project.name}
        description={
          <>
            <Badge variant="outline" className="capitalize mr-2">
              {String(project.project_type).replace(/_/g, " ")}
            </Badge>
            <Badge>{project.status}</Badge>
          </>
        }
        actions={
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/clients/firm/$firmId", params: { firmId } })}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to firm
          </Button>
        }
      />

      <ProjectGroupedTabs firmId={firmId} projectId={projectId} project={project} />
    </AppShell>
  );
}

function ProjectGroupedTabs({
  firmId: _firmId,
  projectId,
  project,
}: {
  firmId: string;
  projectId: string;
  project: any;
}) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Stages</TabsTrigger>
          <TabsTrigger value="task-types">Task Type</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <TabBoundary name="Overview">
            <div className="space-y-4">
              <OverviewTab project={project} />
              <FeaturesTab projectId={projectId} />
              <ProjectSharePointCard projectId={projectId} />
            </div>
          </TabBoundary>
        </TabsContent>
        <TabsContent value="pipeline">
          <TabBoundary name="Stages">
            <PipelineTab projectId={projectId} />
          </TabBoundary>
        </TabsContent>
        <TabsContent value="task-types">
          <TabBoundary name="Task Type">
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
                <div className="lg:col-span-4">
                  <ReturnTypesTab projectId={projectId} />
                </div>
                <div className="lg:col-span-3">
                  <LevelEditorTab projectId={projectId} kind="difficulty" />
                </div>
                <div className="lg:col-span-3">
                  <LevelEditorTab projectId={projectId} kind="urgency" />
                </div>
              </div>
              <TaskOptionsTab projectId={projectId} />
              <CustomFieldsTab project={project} />
              <DocumentsTab projectId={projectId} />
            </div>
          </TabBoundary>
        </TabsContent>
        <TabsContent value="pricing">
          <TabBoundary name="Pricing">
            <PricingPeriodsTab projectId={projectId} />
          </TabBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ project }: { project: any }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [p, setP] = useState({ ...project });
  useEffect(() => setP({ ...project }), [project]);

  const save = useMutation({
    mutationFn: async () => {
      const codeUp = String(p.code ?? "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z0-9-]{2,12}$/.test(codeUp)) {
        throw new Error("Project code is required (2–12 uppercase letters, digits, or dashes)");
      }
      const patch: any = {
        name: p.name,
        project_type: p.project_type,
        status: p.status,
        description: p.description,
        software: (p.software ?? []) as SoftwareType[],
        currency: p.currency ? String(p.currency).toUpperCase() : null,
      };
      if (codeUp !== String(project.code ?? "").toUpperCase()) {
        patch.code = codeUp;
      }
      const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["fh-project", project.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = () => {
    setP({ ...project });
    setEditing(false);
  };

  if (!editing) {
    return (
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Name" value={project.name} />
            <Field label="Code" value={project.code ?? "—"} />
            <Field
              label="Type"
              value={String(project.project_type ?? "other").replace(/_/g, " ")}
            />
            <Field label="Status" value={project.status ?? "—"} />
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Software
              </div>
              <div className="flex flex-wrap gap-1">
                {(project.software ?? []).length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  (project.software as SoftwareType[]).map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      {labelFor(SOFTWARE_OPTIONS, s)}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>
          <Field label="Description" value={project.description || "—"} multiline />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input value={p.name ?? ""} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </div>
          <div>
            <Label>Project code *</Label>
            <Input
              value={p.code ?? ""}
              onChange={(e) =>
                setP({
                  ...p,
                  code: e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9-]/g, "")
                    .slice(0, 12),
                })
              }
              className="font-mono uppercase"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              2–12 chars, A–Z 0–9 dashes. Editable at any time — task display IDs use the current
              code.
            </p>
          </div>

          <div>
            <Label>Type</Label>
            <Select
              value={p.project_type ?? "other"}
              onValueChange={(v) => setP({ ...p, project_type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["tax_preparation", "bookkeeping", "audit", "payroll", "advisory", "other"].map(
                  (t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={p.status ?? "active"} onValueChange={(v) => setP({ ...p, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["active", "paused", "archived"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Software</Label>
            <MultiSoftwareSelect
              value={(p.software ?? []) as SoftwareType[]}
              onChange={(next) => setP({ ...p, software: next })}
            />
          </div>
          <div>
            <Label>Currency</Label>
            <CurrencyPicker
              value={p.currency ?? null}
              onChange={(v) => setP({ ...p, currency: v })}
              allowInherit
              inheritLabel="Inherit from firm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Leave on "Inherit" to use the firm's default currency.
            </p>
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            rows={3}
            value={p.description ?? ""}
            onChange={(e) => setP({ ...p, description: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={cancel} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className={multiline ? "text-sm whitespace-pre-wrap" : "text-sm font-medium capitalize"}>
        {value}
      </div>
    </div>
  );
}

/* ----------- CUSTOM FIELDS ----------- */
function CustomFieldsTab({ project }: { project: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);

  const { data: defs = [] } = useQuery({
    queryKey: ["fh-fielddefs", project.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_custom_field_defs")
        .select("*")
        .eq("project_id", project.id)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("project_custom_field_defs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Field added");
      setOpen(false);
      setKey("");
      setLabel("");
      setOptions("");
      setRequired(false);
      qc.invalidateQueries({ queryKey: ["fh-fielddefs", project.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("project_custom_field_defs").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fh-fielddefs", project.id] }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_custom_field_defs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fh-fielddefs", project.id] }),
  });

  const presets = PROJECT_TYPE_PRESETS[project.project_type] ?? [];
  const existingKeys = new Set((defs as any[]).map((d: any) => d.key));
  const seedPreset = useMutation({
    mutationFn: async () => {
      const toInsert = presets
        .filter((p) => !existingKeys.has(p.key))
        .map((p, i) => ({
          project_id: project.id,
          key: p.key,
          label: p.label,
          field_type: p.field_type,
          options: p.options,
          sort_order: 100 + i,
        }));
      if (toInsert.length === 0) return;
      const { error } = await supabase.from("project_custom_field_defs").insert(toInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preset fields added");
      qc.invalidateQueries({ queryKey: ["fh-fielddefs", project.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!key || !label) {
      toast.error("Key and label required");
      return;
    }
    add.mutate({
      project_id: project.id,
      key,
      label,
      field_type: fieldType,
      required,
      options: ["select", "multiselect"].includes(fieldType)
        ? options
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    });
  };

  return (
    <div className="space-y-4">
      {presets.length > 0 && presets.some((p) => !existingKeys.has(p.key)) && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="text-sm">
              Suggested fields for{" "}
              <strong>{String(project.project_type).replace(/_/g, " ")}</strong>:{" "}
              {presets.map((p) => p.label).join(", ")}
            </div>
            <Button size="sm" variant="outline" onClick={() => seedPreset.mutate()}>
              Add suggested
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Custom fields</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Add field
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New custom field</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Key (snake_case) *</Label>
                  <Input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="tax_form"
                  />
                </div>
                <div>
                  <Label>Display label *</Label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Tax Form"
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={fieldType} onValueChange={setFieldType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["text", "number", "date", "select", "multiselect", "boolean"].map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(fieldType === "select" || fieldType === "multiselect") && (
                  <div>
                    <Label>Options (comma-separated)</Label>
                    <Input
                      value={options}
                      onChange={(e) => setOptions(e.target.value)}
                      placeholder="1040, 1120, 1120-S, 1065"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch checked={required} onCheckedChange={setRequired} />
                  <span className="text-sm">Required</span>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={add.isPending}>
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {defs.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground text-center">
              No custom fields configured.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(defs as any[]).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.label}</TableCell>
                    <TableCell className="text-xs font-mono">{d.key}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.field_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {Array.isArray(d.options) && d.options.length ? d.options.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={d.required}
                        onCheckedChange={(v) => update.mutate({ id: d.id, patch: { required: v } })}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={d.enabled}
                        onCheckedChange={(v) => update.mutate({ id: d.id, patch: { enabled: v } })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => del.mutate(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ----------- PIPELINE ----------- */
const PRIMARY_STATE_OPTIONS = MAJOR_STAGES;

function PipelineTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isSuper = (roles ?? []).includes("super_admin");
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [terminal, setTerminal] = useState(false);
  const [primaryState, setPrimaryState] = useState<string>("with_bat");

  const { data: stages = [] } = useQuery({
    queryKey: ["fh-stages", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_pipeline_stages")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!label || !key) throw new Error("Key and label required");
      const maxOrder = (stages as any[]).reduce(
        (m: number, s: any) => Math.max(m, s.sort_order),
        0,
      );
      const { error } = await supabase.from("project_pipeline_stages").insert({
        project_id: projectId,
        key,
        label,
        sort_order: maxOrder + 1,
        is_terminal: terminal,
        primary_state: primaryState,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stage added");
      setOpen(false);
      setLabel("");
      setKey("");
      setTerminal(false);
      setPrimaryState("with_bat");
      qc.invalidateQueries({ queryKey: ["fh-stages", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("project_pipeline_stages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fh-stages", projectId] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      if ((stages as any[]).length <= 1) throw new Error("Cannot delete the last remaining stage");
      const { error } = await supabase.from("project_pipeline_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stage removed");
      qc.invalidateQueries({ queryKey: ["fh-stages", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = (idx: number, dir: -1 | 1) => {
    const arr = [...(stages as any[])];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    const a = arr[idx],
      b = arr[swap];
    update.mutate({ id: a.id, patch: { sort_order: b.sort_order } });
    update.mutate({ id: b.id, patch: { sort_order: a.sort_order } });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Workflow stages</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Stages are grouped under four major stages: With BAT, With CPA, On Hold, and Completed.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add stage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New stage</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Label *</Label>
                <Input
                  value={label}
                  onChange={(e) => {
                    setLabel(e.target.value);
                    if (!key) setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
                  }}
                />
              </div>
              <div>
                <Label>Key (snake_case) *</Label>
                <Input value={key} onChange={(e) => setKey(e.target.value)} />
              </div>
              <div>
                <Label>Major stage *</Label>
                <Select value={primaryState} onValueChange={setPrimaryState}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAJOR_STAGES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Major stage drives kanban grouping and billing roll-ups.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={terminal} onCheckedChange={setTerminal} />
                <span className="text-sm">Terminal stage (e.g. Completed)</span>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => add.mutate()} disabled={add.isPending}>
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {stages.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center">No stages.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {MAJOR_STAGES.map((maj) => {
              const inGroup = (stages as any[]).filter(
                (s) => (s.primary_state ?? "with_bat") === maj.value,
              );
              return (
                <div key={maj.value} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge className={maj.tone + " border-0"}>{maj.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {inGroup.length} stage{inGroup.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {inGroup.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic py-3 text-center">
                      No stages here
                    </div>
                  ) : (
                    inGroup.map((s, i) => {
                      const globalIdx = (stages as any[]).findIndex((x) => x.id === s.id);
                      return (
                        <div key={s.id} className="rounded-md border bg-background p-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="shrink-0">
                              {globalIdx + 1}
                            </Badge>
                            <Input
                              defaultValue={s.label}
                              className="h-8 font-medium"
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== s.label)
                                  update.mutate(
                                    { id: s.id, patch: { label: v } },
                                    { onSuccess: () => toast.success("Stage renamed") },
                                  );
                              }}
                            />
                          </div>
                          <div className="text-xs font-mono text-muted-foreground truncate">
                            {s.key}
                            {s.is_terminal && " · terminal"}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Select
                              value={s.primary_state ?? "with_bat"}
                              onValueChange={(v) =>
                                update.mutate({ id: s.id, patch: { primary_state: v } })
                              }
                            >
                              <SelectTrigger className="h-7 text-xs flex-1 min-w-[110px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MAJOR_STAGES.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={globalIdx === 0}
                              onClick={() => move(globalIdx, -1)}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={globalIdx === stages.length - 1}
                              onClick={() => move(globalIdx, 1)}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => del.mutate(s.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {isSuper && (
                            <>
                              <div className="flex items-center gap-2 pt-1 border-t">
                                <Switch
                                  checked={!!s.is_billable}
                                  onCheckedChange={(v) =>
                                    update.mutate({ id: s.id, patch: { is_billable: v } })
                                  }
                                />
                                <span className="text-[11px] text-muted-foreground flex-1">
                                  Billable milestone
                                </span>
                              </div>
                              {s.is_billable && (
                                <Input
                                  defaultValue={s.revrec_label ?? ""}
                                  placeholder='Revenue label (e.g. "Filed")'
                                  className="h-7 text-xs"
                                  onBlur={(e) => {
                                    const v = e.target.value.trim() || null;
                                    if (v !== (s.revrec_label ?? null))
                                      update.mutate({ id: s.id, patch: { revrec_label: v } });
                                  }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------- TASK OPTIONS ----------- */
const TASK_TYPE_PRESETS = ["form_1040", "form_1065", "form_1120", "form_1120s", "none"];
const PRIORITY_PRESETS = ["low", "medium", "high"];
const STATUS_PRESETS = ["draft", "in_progress", "review", "waiting_client", "complete"];

function TaskOptionsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();

  const { data: opts } = useQuery({
    queryKey: ["fh-task-options", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_task_options")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? {
          project_id: projectId,
          default_task_type_id: null,
          default_priority: null,
          default_status: null,
          archived_priorities: [],
          archived_statuses: [],
          default_assignee_id: null,
          default_reviewer_id: null,
        }
      );
    },
  });

  const { data: taskTypes = [] } = useQuery({
    queryKey: ["fh-return-types", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_return_types")
        .select("id, code, label, is_archived")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["task-opts-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [state, setState] = useState<any>(opts);
  useEffect(() => {
    if (opts) setState(opts);
  }, [opts]);

  const save = useMutation({
    mutationFn: async (next: any) => {
      const payload = {
        project_id: projectId,
        default_task_type_id: next?.default_task_type_id || null,
        default_priority: next?.default_priority || null,
        default_status: next?.default_status || null,
        archived_priorities: next?.archived_priorities ?? [],
        archived_statuses: next?.archived_statuses ?? [],
        default_assignee_id: next?.default_assignee_id || null,
        default_reviewer_id: next?.default_reviewer_id || null,
        default_due_hours: next?.default_due_hours ?? 48,
      };
      const { error } = await supabase
        .from("project_task_options")
        .upsert(payload, { onConflict: "project_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fh-task-options", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = (patch: any) => {
    const next = { ...state, ...patch };
    setState(next);
    save.mutate(next);
  };

  if (!state)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );

  const activeTypes = (taskTypes as any[]).filter((t) => !t.is_archived);
  const activePriorities = PRIORITY_PRESETS.filter(
    (p) => !(state.archived_priorities ?? []).includes(p),
  );
  const activeStatuses = STATUS_PRESETS.filter((s) => !(state.archived_statuses ?? []).includes(s));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Pre-selected when creating a new task. Operations users can still override per task.
            Changes save automatically.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div>
            <Label>Default task type</Label>
            <Select
              value={state.default_task_type_id ?? "__none"}
              onValueChange={(v) => apply({ default_task_type_id: v === "__none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {activeTypes.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.code} · {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default priority</Label>
            <Select
              value={state.default_priority ?? "__none"}
              onValueChange={(v) => apply({ default_priority: v === "__none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {activePriorities.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default status</Label>
            <Select
              value={state.default_status ?? "__none"}
              onValueChange={(v) => apply({ default_status: v === "__none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {activeStatuses.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default assignee</Label>
            <Select
              value={state.default_assignee_id ?? "__none"}
              onValueChange={(v) => apply({ default_assignee_id: v === "__none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {(profiles as any[]).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default reviewer</Label>
            <Select
              value={state.default_reviewer_id ?? "__none"}
              onValueChange={(v) => apply({ default_reviewer_id: v === "__none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {(profiles as any[]).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default due (hours)</Label>
            <Select
              value={String(state.default_due_hours ?? 48)}
              onValueChange={(v) => apply({ default_due_hours: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 h — 1 day</SelectItem>
                <SelectItem value="48">48 h — 2 days</SelectItem>
                <SelectItem value="72">72 h — 3 days</SelectItem>
                <SelectItem value="120">120 h — 5 days</SelectItem>
                <SelectItem value="168">168 h — 1 week</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ----------- FEATURES ----------- */
const FEATURE_FLAGS: Array<{ key: string; label: string; desc: string }> = [
  { key: "discussion_enabled", label: "Discussion", desc: "Threaded conversations on tasks" },
  { key: "notes_enabled", label: "Notes", desc: "Internal notes & SOPs" },
  { key: "links_enabled", label: "Links", desc: "External reference links" },
  { key: "open_points_enabled", label: "Open Points", desc: "Track open items & blockers" },
  { key: "files_enabled", label: "Files", desc: "File attachments & uploads" },
  { key: "timesheet_enabled", label: "Time Sheet", desc: "Time tracking on tasks" },
  { key: "audit_trail_enabled", label: "Audit Trail", desc: "Activity history log" },
];

function FeaturesTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["fh-features", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_feature_toggles")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? {
          project_id: projectId,
          discussion_enabled: true,
          notes_enabled: true,
          links_enabled: true,
          open_points_enabled: true,
          files_enabled: true,
          timesheet_enabled: true,
          audit_trail_enabled: true,
        }
      );
    },
  });

  const update = useMutation({
    mutationFn: async (patch: any) => {
      const payload = { project_id: projectId, ...data, ...patch };
      delete payload.updated_at;
      delete payload.updated_by;
      const { error } = await supabase
        .from("project_feature_toggles")
        .upsert(payload, { onConflict: "project_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fh-features", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );

  const onSkipToggle = async (v: boolean) => {
    update.mutate({ skip_entity_hierarchy: v });
    if (v) {
      // Ensure a hidden default entity exists so tasks can attach directly to project.
      await supabase.rpc(
        "ensure_project_default_entity" as never,
        { _project_id: projectId } as never,
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project features</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="font-medium">Skip Client Entity layer</div>
            <div className="text-xs text-muted-foreground">
              {(data as any).skip_entity_hierarchy
                ? "Tasks attach directly to the project — no entity grouping."
                : "Tasks must be assigned to a Client Entity within this project."}
            </div>
          </div>
          <Switch checked={!!(data as any).skip_entity_hierarchy} onCheckedChange={onSkipToggle} />
        </div>
        {FEATURE_FLAGS.map((f) => (
          <div key={f.key} className="flex items-center justify-between py-3">
            <div>
              <div className="font-medium">{f.label}</div>
              <div className="text-xs text-muted-foreground">{f.desc}</div>
            </div>
            <Switch
              checked={!!(data as any)[f.key]}
              onCheckedChange={(v) => update.mutate({ [f.key]: v })}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ----------- RETURN TYPES ----------- */
const DEFAULT_RETURN_TYPES = [
  { code: "1040", label: "Form 1040 — Individual" },
  { code: "1065", label: "Form 1065 — Partnership" },
  { code: "1120", label: "Form 1120 — Corporation" },
  { code: "1120S", label: "Form 1120-S — S Corp" },
  { code: "1041", label: "Form 1041 — Estate/Trust" },
  { code: "990", label: "Form 990 — Nonprofit" },
];

type ReturnTypeDraft = {
  id?: string;
  code: string;
  label: string;
  enabled: boolean;
  is_archived: boolean;
  _new?: boolean;
};

function ReturnTypesTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<ReturnTypeDraft[]>([]);

  const { data: types = [] } = useQuery({
    queryKey: ["fh-return-types", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_return_types")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!addOpen) return;
    setDraft(
      (types as any[]).map((t) => ({
        id: t.id,
        code: t.code ?? "",
        label: t.label ?? "",
        enabled: !!t.enabled,
        is_archived: !!t.is_archived,
      })),
    );
  }, [addOpen, types]);

  const updateDraft = (i: number, patch: Partial<ReturnTypeDraft>) =>
    setDraft((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addBlank = () =>
    setDraft((rows) => [
      ...rows,
      { code: "", label: "", enabled: true, is_archived: false, _new: true },
    ]);
  const removeDraft = (i: number) => setDraft((rows) => rows.filter((_, idx) => idx !== i));

  const { data: usedTypeIds = new Set<string>() } = useQuery({
    queryKey: ["fh-return-type-usage", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("return_type_id")
        .eq("project_id", projectId)
        .not("return_type_id", "is", null);
      if (error) throw error;
      return new Set<string>(((data ?? []) as any[]).map((r) => r.return_type_id).filter(Boolean));
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      if ((usedTypeIds as Set<string>).has(id))
        throw new Error(
          "Cannot delete — this task type is used by one or more tasks. Archive it instead.",
        );
      const { error } = await supabase.from("project_return_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fh-return-types", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAll = useMutation({
    mutationFn: async (rows: ReturnTypeDraft[]) => {
      const byId = new Map<string, any>((types as any[]).map((t) => [t.id, t]));
      const cleaned = rows
        .map((r) => ({ ...r, code: r.code.trim(), label: r.label.trim() }))
        .filter((r) => r.code || r.label || r.id);

      for (const r of cleaned) {
        if (!r.code || !r.label) throw new Error("Every row needs a code and a label");
      }
      const codes = cleaned.map((r) => r.code.toLowerCase());
      const dup = codes.find((c, i) => codes.indexOf(c) !== i);
      if (dup) throw new Error(`Duplicate code "${dup}"`);

      const inserts = cleaned.filter((r) => !r.id);
      if (inserts.length) {
        const base = (types as any[]).length;
        const { error } = await supabase.from("project_return_types").insert(
          inserts.map((r, i) => ({
            project_id: projectId,
            code: r.code,
            label: r.label,
            enabled: r.enabled,
            is_archived: r.is_archived,
            sort_order: base + i,
          })),
        );
        if (error) throw error;
      }

      const updates = cleaned.filter((r) => {
        if (!r.id) return false;
        const orig = byId.get(r.id);
        if (!orig) return false;
        return (
          orig.code !== r.code ||
          orig.label !== r.label ||
          !!orig.enabled !== r.enabled ||
          !!orig.is_archived !== r.is_archived
        );
      });
      for (const r of updates) {
        const { error } = await supabase
          .from("project_return_types")
          .update({
            code: r.code,
            label: r.label,
            enabled: r.enabled,
            is_archived: r.is_archived,
          })
          .eq("id", r.id!);
        if (error) throw error;
      }

      return { inserted: inserts.length, updated: updates.length };
    },
    onSuccess: ({ inserted, updated }) => {
      toast.success(`Saved · ${inserted} added, ${updated} updated`);
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["fh-return-types", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const existingCodes = new Set((types as any[]).map((t: any) => t.code));
  const seedDefaults = useMutation({
    mutationFn: async () => {
      const toInsert = DEFAULT_RETURN_TYPES.filter((t) => !existingCodes.has(t.code)).map(
        (t, i) => ({
          project_id: projectId,
          code: t.code,
          label: t.label,
          sort_order: 100 + i,
        }),
      );
      if (toInsert.length === 0) return;
      const { error } = await supabase.from("project_return_types").insert(toInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Defaults added");
      qc.invalidateQueries({ queryKey: ["fh-return-types", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Task types</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Define the kinds of tasks this project supports (e.g. tax returns, accounting, sales
            tax). Tasks created under this project can pick from this list.
          </p>
        </div>
        <div className="flex gap-2">
          {DEFAULT_RETURN_TYPES.some((t) => !existingCodes.has(t.code)) && (
            <Button size="sm" variant="outline" onClick={() => seedDefaults.mutate()}>
              Add common types
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add/Edit Type
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Add / Edit task types</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Edit existing rows in place or add new ones. Save commits all changes.
                </p>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-auto pr-1">
                <div className="grid grid-cols-[160px_1fr_90px_100px_40px] gap-2 text-[11px] font-medium text-muted-foreground px-1 pb-1 sticky top-0 bg-background z-10">
                  <div>Code *</div>
                  <div>Label *</div>
                  <div className="text-center">Enabled</div>
                  <div className="text-center">Archived</div>
                  <div></div>
                </div>
                <div className="space-y-1.5">
                  {draft.length === 0 && (
                    <div className="text-xs text-muted-foreground py-6 text-center">
                      No types yet. Click "Add row" to begin.
                    </div>
                  )}
                  {draft.map((row, i) => {
                    const inUse = !!row.id && (usedTypeIds as Set<string>).has(row.id);
                    return (
                      <div
                        key={row.id ?? `new-${i}`}
                        className="grid grid-cols-[160px_1fr_90px_100px_40px] gap-2 items-center"
                      >
                        <Input
                          className="h-8 font-mono text-xs"
                          value={row.code}
                          onChange={(e) => updateDraft(i, { code: e.target.value })}
                          placeholder="1040"
                        />
                        <Input
                          className="h-8 text-xs"
                          value={row.label}
                          onChange={(e) => updateDraft(i, { label: e.target.value })}
                          placeholder="Form 1040 — Individual"
                        />
                        <div className="flex justify-center">
                          <Switch
                            checked={row.enabled}
                            onCheckedChange={(v) => updateDraft(i, { enabled: v })}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={row.is_archived}
                            onCheckedChange={(v) => updateDraft(i, { is_archived: v })}
                          />
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={inUse}
                          title={inUse ? "In use — toggle Archived instead" : "Remove from list"}
                          onClick={() => {
                            if (row.id) {
                              if (!confirm(`Delete "${row.label || row.code}"?`)) return;
                              del.mutate(row.id);
                            }
                            removeDraft(i);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={addBlank}>
                  <Plus className="h-4 w-4 mr-1" /> Add row
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveAll.mutate(draft)}
                    disabled={saveAll.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {types.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center">
            No return types configured.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(types as any[])
                .filter((t) => !t.is_archived)
                .map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm">{t.code}</TableCell>
                    <TableCell>{t.label}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------- PRICING moved to @/components/clients/pricing-tab ----------- */

import { ProjectDocumentsTab } from "@/components/firm-hub/project-documents-tab";
function DocumentsTab({ projectId }: { projectId: string }) {
  return <ProjectDocumentsTab projectId={projectId} />;
}

/* ----------- DIFFICULTY / URGENCY LEVEL EDITOR ----------- */

const LEVEL_ICON_REGISTRY: Record<string, LucideIcon> = {
  feather: Feather,
  brain: Brain,
  puzzle: Puzzle,
  layers: Layers,
  network: Network,
  gauge: Gauge,
  sigma: Sigma,
  turtle: Turtle,
  clock: Clock,
  zap: Zap,
  flame: Flame,
  alarm: AlarmClock,
  timer: Timer,
  bell: Bell,
  siren: Siren,
};

function LevelIcon({
  name,
  className = "h-3.5 w-3.5",
}: {
  name?: string | null;
  className?: string;
}) {
  if (!name) return null;
  const C = LEVEL_ICON_REGISTRY[name];
  if (C) return <C className={className} />;
  return <span className="text-sm leading-none">{name}</span>;
}

function IconPickerPopover({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 w-9 rounded border inline-flex items-center justify-center hover:bg-muted"
          title={value}
        >
          <LevelIcon name={value} className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-4 gap-1">
          {options.map((i) => (
            <button
              key={i}
              type="button"
              title={i}
              onClick={() => {
                onChange(i);
                setOpen(false);
              }}
              className={
                "w-9 h-9 rounded border inline-flex items-center justify-center transition " +
                (value === i ? "border-primary bg-primary/10" : "hover:bg-muted")
              }
            >
              <LevelIcon name={i} className="h-4 w-4" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColorPickerPopover({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 w-12 rounded border inline-flex items-center justify-center hover:bg-muted overflow-hidden"
          title={options.find((c) => c.value === value)?.label ?? "Color"}
        >
          <span className={"inline-block h-5 w-9 rounded " + (value || "bg-muted")} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="grid grid-cols-2 gap-1">
          {options.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                onChange(c.value);
                setOpen(false);
              }}
              className={
                "px-2 py-1 rounded border text-xs transition text-left " +
                (value === c.value ? "border-primary ring-1 ring-primary" : "hover:bg-muted")
              }
            >
              <span className={"inline-flex items-center px-2 py-0.5 rounded " + c.value}>
                {c.label}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const DIFFICULTY_ICON_KEYS = ["feather", "brain", "puzzle", "layers", "network", "gauge", "sigma"];
const URGENCY_ICON_KEYS = ["turtle", "clock", "zap", "flame", "alarm", "timer", "bell", "siren"];

// Difficulty = cognitive load. Cool, calm palette.
const DIFFICULTY_COLOR_OPTIONS = [
  { value: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300", label: "Slate" },
  { value: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", label: "Sky" },
  {
    value: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    label: "Indigo",
  },
  {
    value: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    label: "Violet",
  },
  {
    value: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    label: "Fuchsia",
  },
  { value: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300", label: "Cyan" },
];

// Urgency = time pressure. Warm, alerting palette.
const URGENCY_COLOR_OPTIONS = [
  {
    value: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    label: "Emerald",
  },
  { value: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300", label: "Amber" },
  {
    value: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    label: "Orange",
  },
  { value: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", label: "Rose" },
  { value: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300", label: "Red" },
  { value: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300", label: "Pink" },
];

const DIFFICULTY_DEFAULTS = [
  {
    key: "simple",
    label: "Simple",
    icon: "feather",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
  {
    key: "moderate",
    label: "Moderate",
    icon: "brain",
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  },
  {
    key: "complex",
    label: "Complex",
    icon: "puzzle",
    color: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  },
];
const URGENCY_DEFAULTS = [
  {
    key: "routine",
    label: "Routine",
    icon: "turtle",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  {
    key: "standard",
    label: "Standard",
    icon: "clock",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    key: "priority",
    label: "Priority",
    icon: "zap",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  },
  {
    key: "critical",
    label: "Critical",
    icon: "flame",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
];

type LevelDraft = {
  id?: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  is_archived: boolean;
  _new?: boolean;
};

function LevelEditorTab({
  projectId,
  kind,
}: {
  projectId: string;
  kind: "difficulty" | "urgency";
}) {
  const qc = useQueryClient();
  const table = kind === "difficulty" ? "project_difficulty_levels" : "project_urgency_levels";
  const title = kind === "difficulty" ? "Difficulty levels" : "Urgency levels";
  const defaults = kind === "difficulty" ? DIFFICULTY_DEFAULTS : URGENCY_DEFAULTS;
  const iconKeys = kind === "difficulty" ? DIFFICULTY_ICON_KEYS : URGENCY_ICON_KEYS;
  const colorOptions = kind === "difficulty" ? DIFFICULTY_COLOR_OPTIONS : URGENCY_COLOR_OPTIONS;
  const usageColumn = kind === "difficulty" ? "difficulty_level_id" : "urgency_level_id";
  const queryKey = ["fh-levels", kind, projectId];

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<LevelDraft[]>([]);

  const { data: rows = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(table)
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: usedIds = new Set<string>() } = useQuery({
    queryKey: ["fh-level-usage", kind, projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tasks")
        .select(usageColumn)
        .eq("project_id", projectId)
        .not(usageColumn, "is", null);
      if (error) throw error;
      return new Set<string>(((data ?? []) as any[]).map((r) => r[usageColumn]).filter(Boolean));
    },
  });

  useEffect(() => {
    if (!addOpen) return;
    setDraft(
      (rows as any[]).map((r) => ({
        id: r.id,
        key: r.key ?? "",
        label: r.label ?? "",
        icon: r.icon ?? iconKeys[0],
        color: r.color ?? colorOptions[0].value,
        enabled: !!r.enabled,
        is_archived: !!r.is_archived,
      })),
    );
  }, [addOpen, rows, iconKeys, colorOptions]);

  const updateDraft = (i: number, patch: Partial<LevelDraft>) =>
    setDraft((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addBlank = () =>
    setDraft((cur) => [
      ...cur,
      {
        key: "",
        label: "",
        icon: iconKeys[0],
        color: colorOptions[0].value,
        enabled: true,
        is_archived: false,
        _new: true,
      },
    ]);
  const removeDraft = (i: number) => setDraft((cur) => cur.filter((_, idx) => idx !== i));

  const del = useMutation({
    mutationFn: async (id: string) => {
      if ((usedIds as Set<string>).has(id))
        throw new Error(
          "Cannot delete — this level is used by one or more tasks. Archive it instead.",
        );
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAll = useMutation({
    mutationFn: async (drafts: LevelDraft[]) => {
      const byId = new Map<string, any>((rows as any[]).map((r) => [r.id, r]));
      const cleaned = drafts
        .map((r) => ({ ...r, key: r.key.trim(), label: r.label.trim() }))
        .filter((r) => r.key || r.label || r.id);

      for (const r of cleaned) {
        if (!r.key || !r.label) throw new Error("Every row needs a key and a label");
      }
      const keys = cleaned.map((r) => r.key);
      const dup = keys.find((k, i) => keys.indexOf(k) !== i);
      if (dup) throw new Error(`Duplicate key "${dup}"`);

      const inserts = cleaned.filter((r) => !r.id);
      if (inserts.length) {
        const base = (rows as any[]).length;
        const { error } = await (supabase as any).from(table).insert(
          inserts.map((r, i) => ({
            project_id: projectId,
            key: r.key,
            label: r.label,
            icon: r.icon,
            color: r.color,
            enabled: r.enabled,
            is_archived: r.is_archived,
            sort_order: base + i,
          })),
        );
        if (error) throw error;
      }

      const updates = cleaned.filter((r) => {
        if (!r.id) return false;
        const orig = byId.get(r.id);
        if (!orig) return false;
        return (
          orig.key !== r.key ||
          orig.label !== r.label ||
          (orig.icon ?? "") !== r.icon ||
          (orig.color ?? "") !== r.color ||
          !!orig.enabled !== r.enabled ||
          !!orig.is_archived !== r.is_archived
        );
      });
      for (const r of updates) {
        const { error } = await (supabase as any)
          .from(table)
          .update({
            key: r.key,
            label: r.label,
            icon: r.icon,
            color: r.color,
            enabled: r.enabled,
            is_archived: r.is_archived,
          })
          .eq("id", r.id!);
        if (error) throw error;
      }

      return { inserted: inserts.length, updated: updates.length };
    },
    onSuccess: ({ inserted, updated }) => {
      toast.success(`Saved · ${inserted} added, ${updated} updated`);
      setAddOpen(false);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const existingKeys = new Set((rows as any[]).map((r) => r.key));
  const seedDefaults = useMutation({
    mutationFn: async () => {
      const toInsert = defaults
        .filter((d) => !existingKeys.has(d.key))
        .map((d, i) => ({
          project_id: projectId,
          key: d.key,
          label: d.label,
          icon: d.icon,
          color: d.color,
          sort_order: 100 + i,
        }));
      if (toInsert.length === 0) return;
      const { error } = await (supabase as any).from(table).insert(toInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Defaults added");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerLabel =
    kind === "difficulty" ? "Add/Edit Difficulty Level" : "Add/Edit Urgency Level";
  const dialogTitle = kind === "difficulty" ? "Difficulty levels" : "Urgency levels";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Editable text, icon, and color. Operations users pick from this list when editing tasks.
            Levels in use cannot be deleted — archive them to hide from new tasks.
          </p>
        </div>
        <div className="flex gap-2">
          {defaults.some((d) => !existingKeys.has(d.key)) && (
            <Button size="sm" variant="outline" onClick={() => seedDefaults.mutate()}>
              Add defaults
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {triggerLabel}
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Add / Edit {dialogTitle}</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Edit existing rows in place or add new ones. Click the icon and color chips to
                  open a picker.
                </p>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-auto pr-1">
                <div className="grid grid-cols-[150px_1fr_60px_70px_70px_80px_40px] gap-2 text-[11px] font-medium text-muted-foreground px-1 pb-1 sticky top-0 bg-background z-10">
                  <div>Key *</div>
                  <div>Label *</div>
                  <div className="text-center">Icon</div>
                  <div className="text-center">Color</div>
                  <div className="text-center">Enabled</div>
                  <div className="text-center">Archived</div>
                  <div></div>
                </div>
                <div className="space-y-1.5">
                  {draft.length === 0 && (
                    <div className="text-xs text-muted-foreground py-6 text-center">
                      None yet. Click "Add row" to begin.
                    </div>
                  )}
                  {draft.map((row, i) => {
                    const inUse = !!row.id && (usedIds as Set<string>).has(row.id);
                    return (
                      <div
                        key={row.id ?? `new-${i}`}
                        className="grid grid-cols-[150px_1fr_60px_70px_70px_80px_40px] gap-2 items-center"
                      >
                        <Input
                          className="h-8 font-mono text-xs"
                          value={row.key}
                          onChange={(e) =>
                            updateDraft(i, {
                              key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                            })
                          }
                          placeholder={kind === "difficulty" ? "moderate" : "priority"}
                        />
                        <Input
                          className="h-8 text-xs"
                          value={row.label}
                          onChange={(e) => updateDraft(i, { label: e.target.value })}
                          placeholder={kind === "difficulty" ? "Moderate" : "Priority"}
                        />
                        <div className="flex justify-center">
                          <IconPickerPopover
                            value={row.icon}
                            options={iconKeys}
                            onChange={(v) => updateDraft(i, { icon: v })}
                          />
                        </div>
                        <div className="flex justify-center">
                          <ColorPickerPopover
                            value={row.color}
                            options={colorOptions}
                            onChange={(v) => updateDraft(i, { color: v })}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={row.enabled}
                            onCheckedChange={(v) => updateDraft(i, { enabled: v })}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={row.is_archived}
                            onCheckedChange={(v) => updateDraft(i, { is_archived: v })}
                          />
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={inUse}
                          title={inUse ? "In use — toggle Archived instead" : "Remove from list"}
                          onClick={() => {
                            if (row.id) {
                              if (!confirm(`Delete "${row.label || row.key}"?`)) return;
                              del.mutate(row.id);
                            }
                            removeDraft(i);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={addBlank}>
                  <Plus className="h-4 w-4 mr-1" /> Add row
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveAll.mutate(draft)}
                    disabled={saveAll.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center">
            No levels yet. Click "Add defaults" to start.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preview</TableHead>
                <TableHead>Key</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows as any[])
                .filter((r) => !r.is_archived)
                .map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge
                        className={
                          (r.color ?? "bg-muted text-muted-foreground") + " border-0 gap-1"
                        }
                      >
                        <LevelIcon name={r.icon} /> {r.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.key}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── ProjectSharePointCard ──────────────────────────────────────────────────
   Shows the SharePoint Document Library URL for this project + provisioning
   status. Admin pastes the URL; BusAcTa resolves drive/list IDs via Graph.
   Library name is decoupled from the project name — renaming the project here
   does NOT rename the SharePoint library.
─────────────────────────────────────────────────────────────────────────────── */
function ProjectSharePointCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveSharePointProjectLibrary);
  const getStatusFn = useServerFn(getProjectSharePointStatus);

  // Provisioning is now inline — no polling needed.
  const { data: status, isLoading } = useQuery({
    queryKey: ["project-sharepoint-status", projectId],
    queryFn: () => getStatusFn({ data: { project_id: projectId } }),
  });

  const [libraryUrl, setLibraryUrl] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (status !== undefined) {
      setLibraryUrl(status?.sharepoint_library_url ?? "");
      setDirty(false);
    }
  }, [status]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { project_id: projectId, library_url: libraryUrl.trim() } }),
    onSuccess: (res) => {
      const msg = !libraryUrl.trim()
        ? "SharePoint library URL cleared"
        : res.status === "waiting_for_site"
          ? "Library URL saved — configure the firm's SharePoint site first"
          : "SharePoint library connected";
      toast.success(msg);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["project-sharepoint-status", projectId] });
    },
    onError: (e: Error) => toast.error(`SharePoint error: ${e.message}`),
  });

  // Derived status for the badge
  const isConfigured = !!status?.sharepoint_drive_id;
  const isPending =
    !isConfigured && !!status?.sharepoint_library_url && status?.job_status === "waiting_for_site";
  const isFailed = !isConfigured && status?.job_status === "dead";

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">SharePoint Document Library</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          {!isLoading && (
            <>
              {isConfigured && (
                <Badge variant="outline" className="gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Configured
                </Badge>
              )}
              {isPending && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3 animate-pulse" />
                  {status?.job_status === "waiting_for_site" ? "Waiting for firm site" : "Pending…"}
                </Badge>
              )}
              {isFailed && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Invalid URL
                </Badge>
              )}
              {!isConfigured && !isPending && !isFailed && (
                <Badge variant="secondary">Not configured</Badge>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Paste the URL of the Document Library created for this project in SharePoint Admin.
          Recommended naming: <span className="font-mono text-[11px]">YYYY Service Type</span> —
          e.g. <em>2026 Tax Preparation</em>. Document libraries cannot be renamed after creation
          without re-pasting the URL here.
        </p>
        <div className="space-y-1.5">
          <Label className="text-sm">Document Library URL</Label>
          <Input
            value={libraryUrl}
            onChange={(e) => {
              setLibraryUrl(e.target.value);
              setDirty(true);
            }}
            placeholder="https://contoso.sharepoint.com/sites/SmithCPA/2026-Tax-Preparation"
          />
        </div>
        {isConfigured && status?.sharepoint_library_url && (
          <a
            href={status.sharepoint_library_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary underline"
          >
            <ExternalLink className="h-3 w-3" /> Open library in SharePoint
          </a>
        )}
        {save.isError && (
          <p className="text-xs text-destructive rounded border border-destructive/30 bg-destructive/5 p-2">
            {save.error?.message}
          </p>
        )}
        {isFailed && status?.job_error && !save.isError && (
          <p className="text-xs text-destructive rounded border border-destructive/30 bg-destructive/5 p-2">
            {status.job_error}
          </p>
        )}
        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${save.isPending ? "animate-spin" : ""}`} />
          {save.isPending ? "Connecting…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
