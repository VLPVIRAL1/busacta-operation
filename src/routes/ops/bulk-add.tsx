import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Download,
  HelpCircle,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { SpreadsheetImport, type ImportColumn } from "@/components/shared/spreadsheet-import";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/shared/utils";
import {
  opsFirmsListQuery,
  firmProjectsQuery,
  pipelineProfilesQuery,
  firmClientsQuery,
  projectReturnTypesQuery,
  projectTaskOptionsQuery,
} from "@/lib/queries/ops.queries";
import type { PipelineProfile, FirmClientRow } from "@/lib/queries/ops.queries";
import {
  directClientsListQuery,
  directClientTaskTypesQuery,
} from "@/lib/queries/direct-clients.queries";
import { bulkCreateTasks } from "@/lib/ops/bulk-tasks.functions";
import type { BulkCreateResult, BulkTaskRowInput } from "@/lib/ops/bulk-tasks.functions";
import { parseAttendanceFile } from "@/lib/hr/parse-attendance-file";
import type { ParsedFile } from "@/lib/hr/parse-attendance-file";
import { downloadBulkTasksTemplate } from "@/lib/hr/csv-templates";
import {
  emptyRow,
  buildProfileMap,
  mapRawRowsWithHeaderMap,
  BULK_COLUMN_ALIASES,
  BULK_COLUMN_LABELS,
  BULK_REQUIRED_FIELDS,
  parseStatus,
  parsePriority,
  parseComplexity,
  parsePeriod,
  parseDatetime,
  type BulkRow,
} from "@/lib/ops/bulk-import-mapper";

// ── Types ─────────────────────────────────────────────────────────────

type ImportRunRecord = {
  id: string;
  date: string;
  firmName: string;
  projectName: string;
  created: number;
  failed: number;
};

type ImportResultState = BulkCreateResult & {
  firmName: string;
  projectName: string;
  submittedRows: BulkRow[];
};

// ── localStorage helpers ──────────────────────────────────────────────

const HISTORY_KEY = "busacta-bulk-task-import-history";

function loadHistory(): ImportRunRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as ImportRunRecord[];
  } catch {
    return [];
  }
}

function saveToHistory(run: ImportRunRecord) {
  const existing = loadHistory();
  localStorage.setItem(HISTORY_KEY, JSON.stringify([run, ...existing].slice(0, 20)));
}

// ── Date helpers ──────────────────────────────────────────────────────

function nowDatetime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function addHoursDatetime(hours: number): string {
  const due = new Date(Date.now() + hours * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}`;
}

// ── Color helpers ─────────────────────────────────────────────────────

const FIRM_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-amber-500",
];

function firmColorClass(firmId: string): string {
  const idx = firmId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % FIRM_COLORS.length;
  return FIRM_COLORS[idx];
}

// ── Static select options ─────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "waiting_client", label: "Waiting" },
  { value: "complete", label: "Complete" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const COMPLEXITY_OPTIONS = [
  { value: "a_hard", label: "A — Hard" },
  { value: "b_medium", label: "B — Medium" },
  { value: "c_easy", label: "C — Easy" },
];

const PERIOD_OPTIONS = [
  { value: "__none__", label: "—" },
  { value: "Monthly", label: "Monthly" },
  { value: "Quarterly", label: "Quarterly" },
  { value: "Yearly", label: "Yearly" },
  { value: "Ad-hoc", label: "Ad-hoc" },
];

// ── Column guide content ──────────────────────────────────────────────

const GUIDE_ENTRIES = [
  { col: "Task ID", hint: "Optional reference ID (e.g. T-001). Stored as display_id." },
  { col: "Client *", hint: "Select from firm clients. New names auto-created." },
  { col: "Title *", hint: "Task or service description." },
  { col: "Description", hint: "Optional notes." },
  { col: "Assignee", hint: "Staff member responsible." },
  { col: "Reviewer", hint: "Staff member who reviews." },
  { col: "Task Type", hint: "Return type from project settings." },
  { col: "Status", hint: "Draft · In Progress · Review · Waiting · Complete" },
  { col: "Priority", hint: "Low · Medium · High" },
  { col: "Complexity", hint: "A (Hard) · B (Medium) · C (Easy)" },
  { col: "Period", hint: "Monthly · Quarterly · Yearly · Ad-hoc" },
  { col: "Tax Year", hint: "e.g. 2024" },
  { col: "Start Date", hint: "Defaults to current date & time." },
  { col: "Due Date", hint: "Defaults from project settings (48 h if not set)." },
];

// ── Route ─────────────────────────────────────────────────────────────

export const Route = createFileRoute("/ops/bulk-add")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[{ label: "Operations", to: "/ops" }, { label: "Bulk Add Tasks" }]}
        fullBleed
      >
        <BulkAddPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

// ── Page ──────────────────────────────────────────────────────────────

function BulkAddPage() {
  const qc = useQueryClient();
  const bulkCreateFn = useServerFn(bulkCreateTasks);

  // ── State ─────────────────────────────────────────────────────────
  const [firmId, setFirmId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [directClientId, setDirectClientId] = useState("");
  const [taskTypeId, setTaskTypeId] = useState("");
  const [result, setResult] = useState<ImportResultState | null>(null);
  const [retryRows, setRetryRows] = useState<BulkRow[] | undefined>(undefined);
  const [history, setHistory] = useState<ImportRunRecord[]>(loadHistory);
  const [showGuide, setShowGuide] = useState(false);
  const [rawFile, setRawFile] = useState<{
    headers: string[];
    rows: ParsedFile["rows"];
    name: string;
  } | null>(null);
  const mappingResolve = useRef<((rows: BulkRow[]) => void) | null>(null);
  const lastSubmittedRef = useRef<BulkRow[]>([]);

  // ── Queries ───────────────────────────────────────────────────────
  const { data: firms = [], isLoading: firmsLoading } = useQuery(opsFirmsListQuery());
  const { data: directClients = [], isLoading: directClientsLoading } =
    useQuery(directClientsListQuery());
  const { data: directClientTaskTypes = [] } = useQuery({
    ...directClientTaskTypesQuery(),
    enabled: !!directClientId,
  });
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    ...firmProjectsQuery(firmId),
    enabled: !!firmId,
  });
  const { data: profiles = [] } = useQuery(pipelineProfilesQuery());
  const { data: firmClients = [] } = useQuery({
    ...firmClientsQuery(firmId),
    enabled: !!firmId,
  });
  const { data: returnTypes = [] } = useQuery({
    ...projectReturnTypesQuery(projectId || null),
    enabled: !!projectId,
  });
  const { data: taskOptions } = useQuery({
    ...projectTaskOptionsQuery(projectId || null),
    enabled: !!projectId,
  });

  const profileMap = useMemo(() => buildProfileMap(profiles), [profiles]);
  const activeProjects = useMemo(() => projects.filter((p) => p.status === "active"), [projects]);
  const selectedFirm = useMemo(() => firms.find((f) => f.id === firmId), [firms, firmId]);
  const selectedProject = useMemo(
    () => activeProjects.find((p) => p.id === projectId),
    [activeProjects, projectId],
  );
  const colorClass = useMemo(() => (firmId ? firmColorClass(firmId) : "bg-slate-400"), [firmId]);

  const isDirect = !!directClientId && !firmId;
  const selectedDirectClient = useMemo(
    () => directClients.find((dc) => dc.id === directClientId),
    [directClients, directClientId],
  );
  const selectedTaskType = useMemo(
    () => directClientTaskTypes.find((tt) => tt.id === taskTypeId),
    [directClientTaskTypes, taskTypeId],
  );
  // Value used by the combined entity select — prefixed to avoid ID collisions
  const entitySelectValue = directClientId
    ? `dc:${directClientId}`
    : firmId
      ? `firm:${firmId}`
      : "";

  // ── Dynamic emptyRow factory ──────────────────────────────────────

  const emptyRowFn = useCallback(() => {
    const dueHours = taskOptions?.default_due_hours ?? 48;
    return emptyRow({
      startDate: nowDatetime(),
      dueDate: addHoursDatetime(dueHours),
    });
  }, [taskOptions]);

  // ── Dynamic columns ───────────────────────────────────────────────

  const NONE = "__none__";

  const personOptions = useMemo(
    () => [
      { value: NONE, label: "(none)" },
      ...profiles
        .filter((p): p is PipelineProfile & { full_name: string } => !!p.full_name)
        .map((p) => ({
          value: p.full_name,
          label: p.email ? `${p.full_name} (${p.email})` : p.full_name,
        })),
    ],
    [profiles],
  );

  const clientOptions = useMemo(
    () => [
      { value: NONE, label: "(none)" },
      ...firmClients.map((c: FirmClientRow) => ({
        value: c.name,
        label: c.name,
        color: colorClass,
        note: `${selectedFirm?.name ?? ""} · ${c.id.slice(0, 8)}…`,
      })),
    ],
    [firmClients, colorClass, selectedFirm],
  );

  const taskTypeOptions = useMemo(
    () => [
      { value: NONE, label: "(none)" },
      ...returnTypes.map((rt) => ({
        value: rt.id,
        label: rt.label,
        note: rt.code,
      })),
    ],
    [returnTypes],
  );

  const parsePersonName = useCallback(
    (raw: string) => {
      if (raw === NONE || !raw.trim()) return "";
      const norm = raw.trim().toLowerCase();
      const match = profiles.find(
        (p) => p.full_name?.trim().toLowerCase() === norm || p.email?.trim().toLowerCase() === norm,
      );
      return match?.full_name ?? raw.trim();
    },
    [profiles],
  );

  const parseClientName = useCallback(
    (raw: string) => {
      if (raw === NONE || !raw.trim()) return "";
      const norm = raw.trim().toLowerCase();
      const match = firmClients.find((c: FirmClientRow) => c.name.toLowerCase() === norm);
      return match?.name ?? raw.trim();
    },
    [firmClients],
  );

  const parseReturnTypeId = useCallback(
    (raw: string) => {
      if (raw === NONE || !raw.trim()) return null;
      if (/^[0-9a-f]{8}-/i.test(raw)) return raw;
      const match = returnTypes.find(
        (rt) =>
          rt.label.toLowerCase() === raw.trim().toLowerCase() ||
          rt.code.toLowerCase() === raw.trim().toLowerCase(),
      );
      return match?.id ?? null;
    },
    [returnTypes],
  );

  const columns = useMemo<ImportColumn<BulkRow>[]>(
    () => [
      { key: "displayId", label: "Task ID", width: 120, placeholder: "e.g. T-001" },
      ...(!isDirect
        ? [
            {
              key: "clientName" as keyof BulkRow,
              label: "Client",
              required: true,
              type: "select" as const,
              width: 220,
              options: clientOptions,
              parse: parseClientName,
            },
          ]
        : []),
      { key: "title", label: "Title", required: true, width: 200 },
      { key: "description", label: "Description", width: 200, placeholder: "Optional" },
      {
        key: "assigneeName",
        label: "Assignee",
        type: "select",
        width: 200,
        options: personOptions,
        parse: parsePersonName,
      },
      {
        key: "reviewerName",
        label: "Reviewer",
        type: "select",
        width: 200,
        options: personOptions,
        parse: parsePersonName,
      },
      ...(!isDirect && returnTypes.length > 0
        ? [
            {
              key: "returnTypeId" as keyof BulkRow,
              label: "Task Type",
              type: "select" as const,
              width: 160,
              options: taskTypeOptions,
              parse: (raw: string) => parseReturnTypeId(raw),
              format: (v: BulkRow[keyof BulkRow]) => {
                if (!v) return "";
                const rt = returnTypes.find((r) => r.id === String(v));
                return rt?.label ?? String(v);
              },
            },
          ]
        : []),
      {
        key: "status",
        label: "Status",
        type: "select",
        width: 140,
        options: STATUS_OPTIONS,
        parse: parseStatus,
      },
      {
        key: "priority",
        label: "Priority",
        type: "select",
        width: 110,
        options: PRIORITY_OPTIONS,
        parse: parsePriority,
      },
      {
        key: "complexity",
        label: "Complexity",
        type: "select",
        width: 130,
        options: COMPLEXITY_OPTIONS,
        parse: parseComplexity,
      },
      {
        key: "period",
        label: "Period",
        type: "select",
        width: 120,
        options: PERIOD_OPTIONS,
        parse: (raw) => (raw === "__none__" ? null : parsePeriod(raw)),
        format: (v) => (v == null ? "" : String(v)),
      },
      {
        key: "taxYear",
        label: "Tax Year",
        type: "number",
        width: 90,
        format: (v) => (v == null ? "" : String(v)),
      },
      {
        key: "startDate",
        label: "Start Date",
        type: "datetime-local",
        width: 185,
        parse: (raw) => parseDatetime(raw, "09:00"),
      },
      {
        key: "dueDate",
        label: "Due Date",
        type: "datetime-local",
        width: 185,
        parse: (raw) => parseDatetime(raw, "17:00"),
      },
    ],
    [
      isDirect,
      clientOptions,
      parseClientName,
      personOptions,
      parsePersonName,
      returnTypes,
      taskTypeOptions,
      parseReturnTypeId,
    ],
  );

  // ── Handlers ──────────────────────────────────────────────────────

  function handleEntityChange(value: string) {
    if (value.startsWith("dc:")) {
      setDirectClientId(value.slice(3));
      setFirmId("");
      setProjectId("");
      setTaskTypeId("");
    } else {
      // Strip the "firm:" prefix — the SelectItem value is `firm:<id>` but firmId
      // must hold the bare UUID (it feeds firm_id queries and entitySelectValue).
      setFirmId(value.startsWith("firm:") ? value.slice(5) : value);
      setDirectClientId("");
      setTaskTypeId("");
      setProjectId("");
    }
    setResult(null);
  }

  // ── Mutation ──────────────────────────────────────────────────────

  const commit = useMutation({
    mutationFn: async ({ rows }: { rows: BulkTaskRowInput[]; submittedRows: BulkRow[] }) =>
      isDirect
        ? bulkCreateFn({ data: { mode: "direct_client", directClientId, taskTypeId, rows } })
        : bulkCreateFn({ data: { mode: "firm", firmId, projectId, rows } }),
    onSuccess: (data, { submittedRows }) => {
      const firmName = isDirect
        ? (selectedDirectClient?.display_name ?? directClientId)
        : (firms.find((f) => f.id === firmId)?.name ?? firmId);
      const projectName = isDirect
        ? (selectedTaskType?.label ?? taskTypeId)
        : (activeProjects.find((p) => p.id === projectId)?.name ?? projectId);
      const run: ImportRunRecord = {
        id: `run-${Date.now()}`,
        date: new Date().toISOString(),
        firmName,
        projectName,
        created: data.created,
        failed: data.errors.length,
      };
      saveToHistory(run);
      setHistory((prev) => [run, ...prev].slice(0, 20));
      setResult({ ...data, firmName, projectName, submittedRows });
      qc.invalidateQueries({ queryKey: ["todos"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["pipeline-tasks"] });
      qc.invalidateQueries({ queryKey: ["pipeline-entities"] });
      if (!isDirect) qc.invalidateQueries({ queryKey: ["firm-clients", firmId] });
      toast.success(`${data.created} task${data.created !== 1 ? "s" : ""} created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── validateRow ───────────────────────────────────────────────────

  const validateRow = useCallback(
    (row: BulkRow): string[] => {
      const errors: string[] = [];
      if (!isDirect && !row.clientName.trim()) errors.push("Client is required");
      if (!row.title.trim()) errors.push("Title is required");
      return errors;
    },
    [isDirect],
  );

  // ── File import with mapping dialog ───────────────────────────────

  const parseFileWithMapping = useCallback(async (file: File): Promise<BulkRow[]> => {
    let parsed: ParsedFile;
    try {
      parsed = await parseAttendanceFile(file);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file");
      return [];
    }
    if (parsed.rows.length === 0) {
      toast.error("No data rows found in the file");
      return [];
    }
    setRawFile({ headers: parsed.headers, rows: parsed.rows, name: file.name });
    return new Promise<BulkRow[]>((resolve) => {
      mappingResolve.current = resolve;
    });
  }, []);

  const handleMappingConfirm = (headerMap: Partial<Record<string, string>>) => {
    if (!rawFile || !mappingResolve.current) return;
    const mapped = mapRawRowsWithHeaderMap(
      { headers: rawFile.headers, rows: rawFile.rows },
      headerMap,
    );
    mappingResolve.current(mapped);
    mappingResolve.current = null;
    setRawFile(null);
  };

  const handleMappingCancel = () => {
    mappingResolve.current?.([]);
    mappingResolve.current = null;
    setRawFile(null);
  };

  // ── Import ────────────────────────────────────────────────────────

  const handleImport = useCallback(
    async (validRows: BulkRow[]) => {
      lastSubmittedRef.current = validRows;
      const today = new Date().toISOString().slice(0, 10);
      const rows: BulkTaskRowInput[] = validRows.map((r) => ({
        displayId: r.displayId.trim() || null,
        clientName: r.clientName.trim(),
        title: r.title.trim(),
        description: r.description.trim() || null,
        assigneeId: r.assigneeName.trim()
          ? (profileMap.get(r.assigneeName.trim().toLowerCase()) ?? null)
          : null,
        reviewerId: r.reviewerName.trim()
          ? (profileMap.get(r.reviewerName.trim().toLowerCase()) ?? null)
          : null,
        status: r.status,
        priority: r.priority,
        complexity: r.complexity,
        period: r.period,
        taxYear: r.taxYear,
        startDate: r.startDate || `${today}T09:00`,
        dueDate: r.dueDate || null,
        returnTypeId:
          r.returnTypeId && !/^[0-9a-f]{8}-/i.test(r.returnTypeId)
            ? (returnTypes.find(
                (rt) =>
                  rt.label.toLowerCase() === r.returnTypeId!.toLowerCase() ||
                  rt.code.toLowerCase() === r.returnTypeId!.toLowerCase(),
              )?.id ?? null)
            : (r.returnTypeId ?? null),
      }));
      await commit.mutateAsync({ rows, submittedRows: validRows });
    },
    [profileMap, returnTypes, commit],
  );

  // ── Retry / errors ────────────────────────────────────────────────

  const retryFailed = () => {
    if (!result) return;
    const failedIndices = new Set(result.errors.map((e) => e.rowIndex));
    const failed = result.submittedRows.filter((_, i) => failedIndices.has(i));
    if (failed.length === 0) {
      toast.error("Could not reconstruct failed rows — please re-enter them");
      return;
    }
    setRetryRows([...failed]);
    setResult(null);
    toast.info(`Retrying ${failed.length} failed row${failed.length === 1 ? "" : "s"}`);
  };

  const downloadErrors = () => {
    if (!result) return;
    const header = "row,client,title,error\n";
    const body = result.errors
      .map((e) => {
        const row = result.submittedRows[e.rowIndex];
        const client = (row?.clientName ?? "").replace(/"/g, "''");
        const title = (row?.title ?? "").replace(/"/g, "''");
        const msg = e.message.replace(/"/g, "''");
        return `${e.rowIndex + 1},"${client}","${title}","${msg}"`;
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-import-errors-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importHint = isDirect ? (
    <span>
      Tasks are created for the selected B2C client under the chosen project type. Assignee /
      Reviewer matched by name — unmatched entries are skipped.
    </span>
  ) : (
    <span>
      Start Date defaults to now. Due Date defaults from project settings (
      {taskOptions?.default_due_hours ?? 48} h). Assignee / Reviewer matched by name — unmatched
      entries are skipped.
    </span>
  );

  const destReady = isDirect ? !!directClientId && !!taskTypeId : !!firmId && !!projectId;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 sm:p-6">
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="shrink-0 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Title */}
          <div>
            <h1 className="text-xl font-bold tracking-tight">Bulk Add Tasks</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Paste or upload a spreadsheet, validate, then import.
            </p>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2">
            <Button
              variant={showGuide ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setShowGuide((v) => !v)}
              title="Toggle column guide"
              className="h-9 w-9"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/ops">
                <ArrowLeft className="h-3.5 w-3.5" /> Operations
              </Link>
            </Button>
          </div>
        </div>

        {/* Destination selects — readable, prominent */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
          {/* Firm / B2C Client */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Firm
            </Label>
            <Select
              value={entitySelectValue}
              onValueChange={handleEntityChange}
              disabled={commit.isPending}
            >
              <SelectTrigger className="h-10 bg-background font-medium shadow-sm">
                <SelectValue
                  placeholder={firmsLoading || directClientsLoading ? "Loading…" : "Select a firm"}
                >
                  {selectedFirm && (
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", colorClass)} />
                      {selectedFirm.name}
                    </span>
                  )}
                  {selectedDirectClient && (
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-violet-500" />
                      {selectedDirectClient.display_name}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-xs">B2B Firms</SelectLabel>
                  {firms.map((f) => (
                    <SelectItem key={f.id} value={`firm:${f.id}`}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn("h-2 w-2 rounded-full shrink-0", firmColorClass(f.id))}
                        />
                        {f.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
                {directClients.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel className="text-xs">B2C Clients</SelectLabel>
                      {directClients.map((dc) => (
                        <SelectItem key={dc.id} value={`dc:${dc.id}`}>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full shrink-0 bg-violet-500" />
                            {dc.display_name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-5" />

          {/* Project (firm mode) OR Project Type (B2C client mode) */}
          {isDirect ? (
            <div className="flex flex-col gap-1 min-w-[200px]">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Project Type
              </Label>
              <Select
                value={taskTypeId}
                onValueChange={setTaskTypeId}
                disabled={!directClientId || commit.isPending}
              >
                <SelectTrigger className="h-10 bg-background font-medium shadow-sm">
                  <SelectValue
                    placeholder={!directClientId ? "← Select a client first" : "Select a type"}
                  >
                    {selectedTaskType && (
                      <span className="font-medium">{selectedTaskType.label}</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {directClientTaskTypes.map((tt) => (
                    <SelectItem key={tt.id} value={tt.id}>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{tt.code}</span>
                        {tt.label}
                      </span>
                    </SelectItem>
                  ))}
                  {directClientTaskTypes.length === 0 && directClientId && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      No project types configured
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1 min-w-[200px]">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Project
              </Label>
              <Select
                value={projectId}
                onValueChange={setProjectId}
                disabled={!firmId || commit.isPending}
              >
                <SelectTrigger className="h-10 bg-background font-medium shadow-sm">
                  <SelectValue
                    placeholder={
                      !firmId
                        ? "← Select a firm first"
                        : projectsLoading
                          ? "Loading…"
                          : "Select a project"
                    }
                  >
                    {selectedProject && <span className="font-medium">{selectedProject.name}</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {activeProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  {!projectsLoading && activeProjects.length === 0 && firmId && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      No active projects for this firm
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Contextual info when ready */}
          {destReady && (
            <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              {!isDirect && returnTypes.length > 0 && (
                <Badge variant="outline" className="text-[11px]">
                  {returnTypes.length} task type{returnTypes.length !== 1 ? "s" : ""}
                </Badge>
              )}
              {!isDirect && firmClients.length > 0 && (
                <Badge variant="outline" className="text-[11px]">
                  {firmClients.length} client{firmClients.length !== 1 ? "s" : ""}
                </Badge>
              )}
              {!isDirect && (
                <span className="text-[11px]">
                  Due default: {taskOptions?.default_due_hours ?? 48} h
                </span>
              )}
              {isDirect && selectedTaskType && (
                <Badge variant="outline" className="text-[11px] bg-violet-50 border-violet-200">
                  Direct · {selectedTaskType.code}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex gap-4">
        {result ? (
          <ImportResultScreen
            result={result}
            onRetry={retryFailed}
            onDownloadErrors={downloadErrors}
            onDone={() => setResult(null)}
          />
        ) : destReady ? (
          <>
            {rawFile && (
              <ColumnMappingDialog
                fileName={rawFile.name}
                rawHeaders={rawFile.headers}
                rowCount={rawFile.rows.length}
                onConfirm={handleMappingConfirm}
                onCancel={handleMappingCancel}
              />
            )}
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <SpreadsheetImport<BulkRow>
                columns={columns}
                emptyRow={emptyRowFn}
                validateRow={validateRow}
                onImport={handleImport}
                onParseFile={parseFileWithMapping}
                onDownloadTemplate={downloadBulkTasksTemplate}
                initialRows={retryRows}
                busy={commit.isPending}
                hint={importHint}
                importLabel={(n) => `Import ${n} task${n === 1 ? "" : "s"}`}
                fill
              />
            </div>

            {/* Guide panel — toggled via (?) */}
            {showGuide && (
              <div className="w-56 shrink-0 overflow-y-auto">
                <ColumnGuidePanel onClose={() => setShowGuide(false)} />
              </div>
            )}
          </>
        ) : (
          <Card className="flex-1">
            <CardContent className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a firm and project above to begin.
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── History ──────────────────────────────────────────────── */}
      {history.length > 0 && !result && (
        <details className="group shrink-0 mt-3">
          <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <span className="transition-transform group-open:rotate-90">▶</span>
            Import history ({history.length})
          </summary>
          <Card className="mt-1.5">
            <CardContent className="max-h-40 overflow-auto p-0">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Date</th>
                    <th className="px-3 py-1.5 text-left">Firm · Project</th>
                    <th className="px-3 py-1.5 text-right">Created</th>
                    <th className="px-3 py-1.5 text-right">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((run) => (
                    <tr key={run.id} className="border-t">
                      <td className="px-3 py-1 tabular-nums text-muted-foreground">
                        {new Date(run.date).toLocaleString()}
                      </td>
                      <td className="px-3 py-1">
                        {run.firmName} · {run.projectName}
                      </td>
                      <td className="px-3 py-1 text-right text-emerald-600">{run.created}</td>
                      <td
                        className={`px-3 py-1 text-right ${run.failed > 0 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {run.failed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </details>
      )}
    </div>
  );
}

// ── Column Guide Panel ────────────────────────────────────────────────

function ColumnGuidePanel({ onClose }: { onClose: () => void }) {
  return (
    <Card className="text-xs">
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between pb-1 border-b">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">
              Column Guide
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        {GUIDE_ENTRIES.map(({ col, hint }) => (
          <div key={col}>
            <p className="font-medium leading-tight">{col}</p>
            <p className="text-muted-foreground leading-snug">{hint}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Import Result Screen ──────────────────────────────────────────────

function ImportResultScreen({
  result,
  onRetry,
  onDownloadErrors,
  onDone,
}: {
  result: ImportResultState;
  onRetry: () => void;
  onDownloadErrors: () => void;
  onDone: () => void;
}) {
  return (
    <Card className="flex-1 overflow-auto">
      <CardContent className="space-y-4 p-6">
        <div>
          <h3 className="text-base font-semibold">Import result</h3>
          <p className="text-sm text-muted-foreground">
            {result.firmName} · {result.projectName}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Submitted" value={result.submittedRows.length} />
          <StatCard label="Created" value={result.created} tone="ok" />
          <StatCard
            label="Failed"
            value={result.errors.length}
            tone={result.errors.length > 0 ? "err" : "ok"}
          />
        </div>
        {result.errors.length > 0 && (
          <>
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>
                {result.errors.length} row{result.errors.length === 1 ? "" : "s"} failed
              </AlertTitle>
              <AlertDescription className="text-xs">
                Review errors below, download the CSV to fix, then retry.
              </AlertDescription>
            </Alert>
            <Card>
              <CardContent className="max-h-[30vh] overflow-auto p-0">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Client</th>
                      <th className="px-3 py-2 text-left">Title</th>
                      <th className="px-3 py-2 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.rowIndex} className="border-t">
                        <td className="px-3 py-1.5 tabular-nums">{e.rowIndex + 1}</td>
                        <td className="px-3 py-1.5">
                          {result.submittedRows[e.rowIndex]?.clientName ?? "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {result.submittedRows[e.rowIndex]?.title ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-destructive">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          {result.errors.length > 0 && (
            <>
              <Button variant="outline" onClick={onDownloadErrors}>
                <Download className="h-4 w-4" /> Download error CSV
              </Button>
              <Button variant="outline" onClick={onRetry}>
                <RotateCcw className="h-4 w-4" /> Retry failed rows
              </Button>
            </>
          )}
          <Button onClick={onDone}>
            Import more <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Column Mapping Dialog ─────────────────────────────────────────────

const MAPPING_FIELD_ORDER = [
  "displayId",
  "clientName",
  "title",
  "description",
  "assigneeName",
  "reviewerName",
  "returnTypeId",
  "status",
  "priority",
  "complexity",
  "period",
  "taxYear",
  "startDate",
  "dueDate",
] as const;

const SKIP = "__skip__";

function ColumnMappingDialog({
  fileName,
  rawHeaders,
  rowCount,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  rawHeaders: string[];
  rowCount: number;
  onConfirm: (headerMap: Partial<Record<string, string>>) => void;
  onCancel: () => void;
}) {
  const [headerMap, setHeaderMap] = useState<Partial<Record<string, string>>>(() => {
    const initial: Partial<Record<string, string>> = {};
    for (const [field, aliases] of Object.entries(BULK_COLUMN_ALIASES)) {
      const match = rawHeaders.find((h) => aliases.some((a) => h.toLowerCase().trim() === a));
      if (match) initial[field] = match;
    }
    return initial;
  });

  const options = [
    { value: SKIP, label: "(skip)" },
    ...rawHeaders.map((h) => ({ value: h, label: h })),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Map columns
            <Badge variant="secondary" className="font-mono text-xs font-normal">
              {fileName}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal">
              {rowCount} row{rowCount === 1 ? "" : "s"}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Match each field to a column from your file. Required fields are marked{" "}
          <span className="text-destructive">*</span>.
        </p>
        <div className="space-y-3">
          {MAPPING_FIELD_ORDER.map((field) => (
            <div key={field} className="grid grid-cols-2 items-center gap-3">
              <span className="text-sm">
                {BULK_COLUMN_LABELS[field] ?? field}
                {BULK_REQUIRED_FIELDS.has(field) && (
                  <span className="ml-0.5 text-destructive">*</span>
                )}
              </span>
              <Select
                value={headerMap[field] ?? SKIP}
                onValueChange={(v) =>
                  setHeaderMap((prev) => ({
                    ...prev,
                    [field]: v === SKIP ? undefined : v,
                  }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="(skip)" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm(headerMap)}>
            Load {rowCount} row{rowCount === 1 ? "" : "s"} <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
