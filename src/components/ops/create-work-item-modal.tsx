import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MultiPersonPicker } from "@/components/shared/multi-person-picker";
import { cn } from "@/lib/shared/utils";
import {
  firmClientsQuery,
  createFirmClient,
  projectReturnTypesQuery,
  projectTaskOptionsQuery,
  projectLevelsQuery,
  projectCustomFieldDefsQuery,
  taskCustomFieldValuesQuery,
  createWorkItem,
  updateWorkItem,
  taskByIdQuery,
  type FirmClientRow,
  type WorkItemPeriod,
  type WorkItemComplexity,
  type ProjectLevelRow,
  type ProjectCustomFieldDef,
} from "@/lib/queries/ops.queries";
import { TASK_PRIORITY_OPTIONS } from "@/lib/shared/domain";
import { PriorityIcon, ComplexityIcon, LevelGlyph } from "@/lib/ui/task-option-icons";

const PERIOD_OPTIONS: { value: WorkItemPeriod; label: string }[] = [
  { value: "Monthly", label: "Monthly" },
  { value: "Quarterly", label: "Quarterly" },
  { value: "Yearly", label: "Yearly" },
  { value: "Ad-hoc", label: "Ad-hoc" },
];

const COMPLEXITY_OPTIONS: { value: WorkItemComplexity; label: string }[] = [
  { value: "a_hard", label: "A — Hard" },
  { value: "b_medium", label: "B — Medium" },
  { value: "c_easy", label: "C — Easy" },
];

const TAX_YEAR_OPTIONS = Array.from({ length: 8 }).map((_, i) => new Date().getFullYear() - i);

/** Format a Date as the local-timezone value used by <input type="datetime-local">. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Parse a `datetime-local` string back to ISO (timestamptz) for the DB. */
function fromLocalInput(s: string): string {
  return new Date(s).toISOString();
}

export interface CreateWorkItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project that the task will live under. Always required. */
  projectId: string;
  /** Firm id used to scope the client picker. */
  firmId: string;
  /** Optional pre-selected firm-level client (e.g. when triggered from an entity that already maps to one). */
  defaultClientId?: string | null;
  /** Fires after a successful create (parent can refetch task lists). */
  onCreated?: (taskId: string) => void;
  /** If set, modal switches to Edit mode and loads the task. Project / Firm become read-only. */
  taskId?: string | null;
}

export function CreateWorkItemModal({
  open,
  onOpenChange,
  projectId,
  firmId,
  defaultClientId,
  onCreated,
  taskId,
}: CreateWorkItemModalProps) {
  const qc = useQueryClient();
  const isEdit = !!taskId;
  const { data: clients = [] } = useQuery({ ...firmClientsQuery(firmId), enabled: open });
  const { data: returnTypes = [] } = useQuery({
    ...projectReturnTypesQuery(projectId),
    enabled: open,
  });
  const { data: existing } = useQuery({
    ...taskByIdQuery(taskId ?? undefined),
    enabled: open && isEdit,
  });
  // Project-configured settings that flow into the form.
  const { data: taskOptions, isPending: optsPending } = useQuery({
    ...projectTaskOptionsQuery(projectId),
    enabled: open,
  });
  const { data: difficultyLevels = [] } = useQuery({
    ...projectLevelsQuery(projectId, "difficulty"),
    enabled: open,
  });
  const { data: urgencyLevels = [] } = useQuery({
    ...projectLevelsQuery(projectId, "urgency"),
    enabled: open,
  });
  const { data: customFieldDefs = [] } = useQuery({
    ...projectCustomFieldDefsQuery(projectId),
    enabled: open,
  });
  const { data: existingCfv } = useQuery({
    ...taskCustomFieldValuesQuery(taskId ?? undefined),
    enabled: open && isEdit,
  });

  // Form state
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [clientId, setClientId] = useState<string | null>(defaultClientId ?? null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [priority, setPriority] = useState("medium");
  const [period, setPeriod] = useState<WorkItemPeriod | "none">("none");
  const [taxYear, setTaxYear] = useState<string>("none");
  const [complexity, setComplexity] = useState<WorkItemComplexity>("b_medium");
  const [returnTypeId, setReturnTypeId] = useState<string>("none");
  // Initial status: applied from project default on create; carried through on edit.
  const [status, setStatus] = useState<string | null>(null);
  // Project-configured level ids ("none" = unset).
  const [difficultyLevelId, setDifficultyLevelId] = useState<string>("none");
  const [urgencyLevelId, setUrgencyLevelId] = useState<string>("none");
  // Custom-field values keyed by field definition id.
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});

  // Start/due — captured ONCE when the modal opens so re-renders don't keep
  // bumping the start time forward.
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      if (!existing) return; // wait for data
      const ex = existing as Record<string, unknown>;
      const ass = (ex.task_assignees as { user_id: string; role: string }[] | null) ?? [];
      setTitle(String(ex.title ?? ""));
      setClientId((ex.client_id as string | null) ?? null);
      setAssignees(ass.filter((p) => p.role === "assignee").map((p) => p.user_id));
      setReviewers(ass.filter((p) => p.role === "reviewer").map((p) => p.user_id));
      setPriority(String(ex.priority ?? "medium"));
      setPeriod((ex.period as WorkItemPeriod | null) ?? "none");
      const ty = ex.tax_year as number | null;
      setTaxYear(ty != null ? String(ty) : "none");
      setComplexity((ex.complexity as WorkItemComplexity) ?? "b_medium");
      setReturnTypeId((ex.return_type_id as string | null) ?? "none");
      setStatus((ex.status as string | null) ?? null);
      setDifficultyLevelId((ex.difficulty_level_id as string | null) ?? "none");
      setUrgencyLevelId((ex.urgency_level_id as string | null) ?? "none");
      setStartDate(ex.start_date ? toLocalInput(new Date(ex.start_date as string)) : "");
      setDueDate(ex.due_date ? toLocalInput(new Date(ex.due_date as string)) : "");
      setDueTouched(true);
      return;
    }
    // Create mode — wait until project defaults have resolved (may be null).
    if (optsPending) return;
    const now = new Date();
    const due = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    setTitle("");
    setTitleTouched(false);
    setClientId(defaultClientId ?? null);
    setAssignees(taskOptions?.default_assignee_id ? [taskOptions.default_assignee_id] : []);
    setReviewers(taskOptions?.default_reviewer_id ? [taskOptions.default_reviewer_id] : []);
    setPriority(taskOptions?.default_priority ?? "medium");
    setPeriod("none");
    setTaxYear("none");
    setComplexity("b_medium");
    setReturnTypeId(taskOptions?.default_task_type_id ?? "none");
    setStatus(taskOptions?.default_status ?? null);
    setDifficultyLevelId("none");
    setUrgencyLevelId("none");
    setCustomValues({});
    setStartDate(toLocalInput(now));
    setDueDate(toLocalInput(due));
    setDueTouched(false);
  }, [open, defaultClientId, isEdit, existing, optsPending, taskOptions]);

  // Edit mode — prefill custom-field values once they load.
  useEffect(() => {
    if (!open || !isEdit || !existingCfv) return;
    const map: Record<string, unknown> = {};
    existingCfv.forEach((v) => {
      map[v.field_def_id] = v.value;
    });
    setCustomValues(map);
  }, [open, isEdit, existingCfv]);

  // Re-derive due whenever start changes, unless the user has overridden it.
  function handleStartChange(v: string) {
    setStartDate(v);
    if (!dueTouched && v) {
      const d = new Date(v);
      d.setHours(d.getHours() + 48);
      setDueDate(toLocalInput(d));
    }
  }
  function handleDueChange(v: string) {
    setDueDate(v);
    setDueTouched(true);
  }

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const selectedClient = clientId ? clientById.get(clientId) : null;
  const parentGroup = selectedClient?.parent_id ? clientById.get(selectedClient.parent_id) : null;

  // Hide archived priorities, but always keep the currently-selected one visible.
  const priorityOptions = useMemo(() => {
    const archived = new Set(taskOptions?.archived_priorities ?? []);
    return TASK_PRIORITY_OPTIONS.filter((o) => !archived.has(o.value) || o.value === priority);
  }, [taskOptions, priority]);
  const hasDifficultyLevels = difficultyLevels.length > 0;
  const hasUrgencyLevels = urgencyLevels.length > 0;

  // Build custom-field payload + validate required fields.
  const isEmptyValue = (v: unknown) =>
    v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  const customFieldValues = useMemo(
    () => customFieldDefs.map((d) => ({ fieldDefId: d.id, value: customValues[d.id] ?? null })),
    [customFieldDefs, customValues],
  );

  const mCreate = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required.");
      if (!clientId) throw new Error("Please select a Client / Entity.");
      if (!startDate || !dueDate) throw new Error("Start and Due dates are required.");
      const missing = customFieldDefs.find((d) => d.required && isEmptyValue(customValues[d.id]));
      if (missing) throw new Error(`"${missing.label}" is required.`);
      const difficulty = difficultyLevelId === "none" ? null : difficultyLevelId;
      const urgency = urgencyLevelId === "none" ? null : urgencyLevelId;
      if (isEdit && taskId) {
        await updateWorkItem({
          taskId,
          title: title.trim(),
          priority,
          period: period === "none" ? null : period,
          taxYear: taxYear === "none" ? null : Number(taxYear),
          complexity,
          difficultyLevelId: difficulty,
          urgencyLevelId: urgency,
          startDate: fromLocalInput(startDate),
          dueDate: fromLocalInput(dueDate),
          assigneeIds: assignees,
          reviewerIds: reviewers,
          returnTypeId: returnTypeId === "none" ? null : returnTypeId,
          status,
          customFieldValues,
          clientId,
        });
        return { taskId };
      }
      return createWorkItem({
        projectId,
        clientId,
        title: title.trim(),
        priority,
        period: period === "none" ? null : period,
        taxYear: taxYear === "none" ? null : Number(taxYear),
        complexity,
        difficultyLevelId: difficulty,
        urgencyLevelId: urgency,
        startDate: fromLocalInput(startDate),
        dueDate: fromLocalInput(dueDate),
        assigneeIds: assignees,
        reviewerIds: reviewers,
        returnTypeId: returnTypeId === "none" ? null : returnTypeId,
        status,
        customFieldValues,
      });
    },
    onSuccess: ({ taskId: id }) => {
      toast.success(isEdit ? "Work item updated" : "Work item created");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["todos"] });
      qc.invalidateQueries({ queryKey: ["task-full", id] });
      qc.invalidateQueries({ queryKey: ["project-entities", projectId] });
      onCreated?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = !!title.trim() && !!clientId && !!startDate && !!dueDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit work item" : "New work item"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit || mCreate.isPending) return;
            mCreate.mutate();
          }}
          className="space-y-4"
        >
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="wi-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="wi-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              required
              autoFocus
              placeholder="e.g. Q1 federal filing"
              className={
                titleTouched && !title.trim()
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
            />
            {titleTouched && !title.trim() && (
              <p className="text-xs text-destructive">Title is required</p>
            )}
          </div>

          {/* Client / Entity */}
          <div className="space-y-2">
            <Label>
              Client / Entity <span className="text-destructive">*</span>
            </Label>
            <ClientEntityPicker
              clients={clients}
              value={clientId}
              onChange={setClientId}
              firmId={firmId}
              onCreated={(id) => {
                setClientId(id);
                qc.invalidateQueries({ queryKey: ["firm-clients", firmId] });
              }}
            />
            {parentGroup && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                📁 Group: {parentGroup.name}
              </Badge>
            )}
          </div>

          {/* Assignees / Reviewers */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Assignees</Label>
              <MultiPersonPicker values={assignees} onChange={setAssignees} placeholder="Assign…" />
            </div>
            <div className="space-y-2">
              <Label>Reviewers</Label>
              <MultiPersonPicker
                values={reviewers}
                onChange={setReviewers}
                placeholder="Reviewer…"
              />
            </div>
          </div>

          {/* Priority / Period / Tax year / Difficulty */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger aria-label={`Priority: ${priority}`}>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <PriorityIcon value={priority} />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-1.5">
                        <PriorityIcon value={o.value} />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as WorkItemPeriod | "none")}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {PERIOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tax year</Label>
              <Select value={taxYear} onValueChange={setTaxYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No tax year</SelectItem>
                  {TAX_YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      TY {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasDifficultyLevels ? (
              <LevelSelect
                label="Difficulty"
                levels={difficultyLevels}
                value={difficultyLevelId}
                onChange={setDifficultyLevelId}
              />
            ) : (
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select
                  value={complexity}
                  onValueChange={(v) => setComplexity(v as WorkItemComplexity)}
                >
                  <SelectTrigger aria-label={`Difficulty: ${complexity}`}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <ComplexityIcon value={complexity} />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLEXITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex items-center gap-1.5">
                          <ComplexityIcon value={o.value} />
                          {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {hasUrgencyLevels && (
              <LevelSelect
                label="Urgency"
                levels={urgencyLevels}
                value={urgencyLevelId}
                onChange={setUrgencyLevelId}
              />
            )}
          </div>

          {/* Start / Due */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wi-start">
                Start date / time <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wi-start"
                type="datetime-local"
                value={startDate}
                onChange={(e) => handleStartChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wi-due">
                Due date / time <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wi-due"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => handleDueChange(e.target.value)}
                required
              />
              {!dueTouched && (
                <p className="text-[10px] text-muted-foreground">
                  Auto-set to Start + 48h. Override anytime.
                </p>
              )}
            </div>
          </div>

          {/* Tax Return Type (optional, only when configured) */}
          {returnTypes.length > 0 && (
            <div className="space-y-2">
              <Label>Tax Return type</Label>
              <Select value={returnTypeId} onValueChange={setReturnTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {returnTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.code} — {rt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom fields (project-configured) */}
          {customFieldDefs.length > 0 && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="text-xs font-medium text-muted-foreground">Custom fields</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {customFieldDefs.map((def) => (
                  <div key={def.id} className="space-y-2">
                    <Label>
                      {def.label}
                      {def.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <CustomFieldInput
                      def={def}
                      value={customValues[def.id]}
                      onChange={(v) => setCustomValues((prev) => ({ ...prev, [def.id]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mCreate.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || mCreate.isPending}>
              {mCreate.isPending
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                  ? "Save changes"
                  : "Create work item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Searchable Combobox for firm-level clients, with inline Quick add. */
function ClientEntityPicker({
  clients,
  value,
  onChange,
  firmId,
  onCreated,
}: {
  clients: FirmClientRow[];
  value: string | null;
  onChange: (id: string) => void;
  firmId: string;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addParent, setAddParent] = useState<string>("none");
  const [creating, setCreating] = useState(false);

  const onlyClients = useMemo(() => clients.filter((c) => c.kind === "client"), [clients]);
  const groups = useMemo(() => clients.filter((c) => c.kind === "group"), [clients]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return onlyClients.filter((c) => (t === "" ? true : c.name.toLowerCase().includes(t)));
  }, [q, onlyClients]);
  const selected = clients.find((c) => c.id === value) ?? null;

  async function handleQuickAdd() {
    const name = addName.trim();
    if (!name) {
      toast.error("Name required");
      return;
    }
    const dup = onlyClients.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (dup) {
      toast.message("Client already exists — selected.");
      onCreated(dup.id);
      setAddOpen(false);
      return;
    }
    setCreating(true);
    try {
      const newId = await createFirmClient({
        firmId,
        name,
        kind: "client",
        parentId: addParent === "none" ? null : addParent,
      });
      onCreated(newId);
      setAddName("");
      setAddParent("none");
      setAddOpen(false);
      toast.success("Client added");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="flex-1 min-w-[200px] justify-between font-normal h-9"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.name : "Select client / entity…"}
            </span>
            <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <Input
            placeholder="Search clients…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 mb-2"
            autoFocus
          />
          <ScrollArea className="max-h-64">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">No clients found</div>
            ) : (
              filtered.map((c) => {
                const group = c.parent_id ? clients.find((g) => g.id === c.parent_id) : null;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left",
                      value === c.id && "bg-accent/60",
                    )}
                  >
                    <span className="truncate flex-1">
                      <span className="block">{c.name}</span>
                      {group && (
                        <span className="block text-[11px] text-muted-foreground">
                          📁 {group.name}
                        </span>
                      )}
                    </span>
                    {value === c.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9">
            <Plus className="h-3.5 w-3.5 mr-1" /> Quick add
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-2" align="end">
          <div className="space-y-1">
            <Label className="text-xs">New client name</Label>
            <Input
              placeholder="Client name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleQuickAdd();
                }
              }}
              autoFocus
            />
          </div>
          {groups.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Group (optional)</Label>
              <Select value={addParent} onValueChange={setAddParent}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No group —</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      📁 {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleQuickAdd}
              disabled={creating || !addName.trim()}
            >
              {creating ? "Adding…" : "Add client"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Select for a project-configured Difficulty / Urgency level, rendering its icon + label. */
function LevelSelect({
  label,
  levels,
  value,
  onChange,
}: {
  label: string;
  levels: ProjectLevelRow[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = levels.find((l) => l.id === value) ?? null;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={`${label}: ${selected?.label ?? "none"}`}>
          {selected ? (
            <span className="flex items-center gap-1.5 min-w-0">
              <LevelGlyph name={selected.icon} />
              <span className="truncate">{selected.label}</span>
            </span>
          ) : (
            <SelectValue placeholder="—" />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— None —</SelectItem>
          {levels.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              <span className="flex items-center gap-1.5">
                <LevelGlyph name={l.icon} />
                {l.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Renders the right input for a custom field definition's type. Value is stored as JSON. */
function CustomFieldInput({
  def,
  value,
  onChange,
}: {
  def: ProjectCustomFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (def.field_type) {
    case "number":
      return (
        <Input
          type="number"
          value={value == null || value === "" ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={value ? String(value) : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "boolean":
      return (
        <div className="flex h-9 items-center">
          <Switch checked={!!value} onCheckedChange={(v) => onChange(v)} />
        </div>
      );
    case "select":
      return (
        <Select
          value={value ? String(value) : "none"}
          onValueChange={(v) => onChange(v === "none" ? null : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {def.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (o: string) =>
        arr.includes(o) ? onChange(arr.filter((x) => x !== o)) : onChange([...arr, o]);
      return (
        <div className="flex flex-wrap gap-1.5">
          {def.options.map((o) => {
            const on = arr.includes(o);
            return (
              <button
                type="button"
                key={o}
                onClick={() => toggle(o)}
                className={cn(
                  "rounded border px-2 py-1 text-xs transition",
                  on ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return (
        <Textarea
          rows={1}
          value={value ? String(value) : ""}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-9"
        />
      );
  }
}
