import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowRight, Download, RotateCcw, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/shared/stat-card";
import { SpreadsheetImport, type ImportColumn } from "@/components/shared/spreadsheet-import";
import { parseAttendanceFile, type RawRow } from "@/lib/hr/parse-attendance-file";
import { bulkCreateEmployees } from "@/lib/hr/employees.functions";
import { downloadEmployeeTemplate } from "@/lib/hr/csv-templates";
import { useAuth } from "@/lib/auth/auth-context";
import {
  saveImportDraft,
  loadImportDraft,
  clearImportDraft,
  type EmpDraftRow,
} from "@/lib/hr/import-wizard-storage";

// ── Row shape (all cells are strings while editing the grid) ────────────

type EmpRow = EmpDraftRow;

const INTERNAL_ROLES = ["employee", "admin", "super_admin", "hr_manager"] as const;

const emptyRow = (): EmpRow => ({
  employee_id: "",
  first_name: "",
  last_name: "",
  email: "",
  department: "",
  position_title: "",
  employment_type: "",
  join_date: "",
  system_role: "employee",
  phone: "",
});

// ── Field parsers ───────────────────────────────────────────────────────

function fuzzyEnum(
  raw: string,
  accepted: readonly string[],
  aliases: Record<string, string>,
): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  const collapsed = s.replace(/[\s-]+/g, "_");
  if (accepted.includes(collapsed)) return collapsed;
  return aliases[s] ?? aliases[collapsed] ?? "";
}

function parseDepartment(raw: string): string {
  return fuzzyEnum(raw, ["ops", "finance", "hr", "exec"], {
    operations: "ops",
    operation: "ops",
    accounts: "finance",
    accounting: "finance",
    account: "finance",
    bookkeeping: "finance",
    accts: "finance",
    human_resources: "hr",
    human_resource: "hr",
    people: "hr",
    executive: "exec",
    management: "exec",
    leadership: "exec",
    admin: "exec",
  });
}

function parseEmploymentType(raw: string): string {
  return fuzzyEnum(raw, ["full_time", "part_time", "contractor", "intern"], {
    full: "full_time",
    fulltime: "full_time",
    ft: "full_time",
    part: "part_time",
    parttime: "part_time",
    pt: "part_time",
    contract: "contractor",
    contractor: "contractor",
    consultant: "contractor",
    intern: "intern",
    internship: "intern",
    trainee: "intern",
  });
}

function parseSystemRole(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (INTERNAL_ROLES as readonly string[]).includes(s) ? s : "employee";
}

function parseDate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

// ── Column definitions ──────────────────────────────────────────────────

const COLUMNS: ImportColumn<EmpRow>[] = [
  { key: "employee_id", label: "Employee ID", required: true, width: 130 },
  { key: "first_name", label: "First name", required: true, width: 140 },
  { key: "last_name", label: "Last name", required: true, width: 140 },
  { key: "email", label: "Email", required: true, width: 220 },
  {
    key: "department",
    label: "Department",
    type: "select",
    width: 140,
    parse: parseDepartment,
    options: [
      { value: "ops", label: "Operations" },
      { value: "finance", label: "Finance" },
      { value: "hr", label: "Human Resources" },
      { value: "exec", label: "Executive" },
    ],
  },
  { key: "position_title", label: "Designation", width: 180 },
  {
    key: "employment_type",
    label: "Employment type",
    type: "select",
    width: 160,
    parse: parseEmploymentType,
    options: [
      { value: "full_time", label: "Full-time" },
      { value: "part_time", label: "Part-time" },
      { value: "contractor", label: "Contractor" },
      { value: "intern", label: "Intern" },
    ],
  },
  { key: "join_date", label: "Date of joining", type: "date", width: 150, parse: parseDate },
  {
    key: "system_role",
    label: "System role",
    required: true,
    type: "select",
    width: 150,
    parse: parseSystemRole,
    options: INTERNAL_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") })),
  },
  { key: "phone", label: "Phone", width: 140 },
];

// ── Header aliases for auto-mapping ────────────────────────────────────

const HEADER_ALIASES: Record<keyof EmpRow, string[]> = {
  first_name: ["first_name", "firstname", "first name", "given name"],
  last_name: ["last_name", "lastname", "last name", "surname", "family name"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "phone_number", "mobile", "telephone"],
  employee_id: ["employee_id", "employee id", "emp id", "emp_id", "id", "code"],
  department: ["department", "dept"],
  position_title: ["position_title", "title", "job title", "designation"],
  employment_type: ["employment_type", "employment type", "type"],
  join_date: ["join_date", "joining date", "date of joining", "doj", "start_date"],
  system_role: ["system_role", "role", "access role"],
};

function normalizeHeader(h: string) {
  return h.toLowerCase().trim().replace(/\s+/g, " ");
}

// ── Validation ──────────────────────────────────────────────────────────

const rowSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  employee_id: z
    .string()
    .trim()
    .min(1, "Employee ID is required")
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Employee ID: letters, digits, . _ - only"),
  department: z.enum(["ops", "finance", "hr", "exec"]).nullable().optional(),
  position_title: z.string().trim().max(120).nullable().optional(),
  employment_type: z.enum(["full_time", "part_time", "contractor", "intern"]).nullable().optional(),
  join_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  system_role: z.enum(INTERNAL_ROLES, { message: "Pick a valid system role" }),
  phone: z.string().trim().max(40).nullable().optional(),
});

function toSchemaInput(row: EmpRow) {
  const orNull = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email.trim().toLowerCase(),
    employee_id: row.employee_id,
    department: orNull(row.department),
    position_title: orNull(row.position_title),
    employment_type: orNull(row.employment_type),
    join_date: orNull(row.join_date),
    system_role: row.system_role || "employee",
    phone: orNull(row.phone),
  };
}

function validateRow(row: EmpRow): string[] {
  const parsed = rowSchema.safeParse(toSchemaInput(row));
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => i.message);
}

// ── File → EmpRow mapping ───────────────────────────────────────────────

function rawRowToEmpRow(raw: RawRow, headerMap: Partial<Record<keyof EmpRow, string>>): EmpRow {
  const pick = (col: string | undefined) =>
    col && raw[col] != null ? String(raw[col]).trim() : "";
  return {
    employee_id: pick(headerMap.employee_id),
    first_name: pick(headerMap.first_name),
    last_name: pick(headerMap.last_name),
    email: pick(headerMap.email).toLowerCase(),
    department: parseDepartment(pick(headerMap.department)),
    position_title: pick(headerMap.position_title),
    employment_type: parseEmploymentType(pick(headerMap.employment_type)),
    join_date: parseDate(pick(headerMap.join_date)),
    system_role: parseSystemRole(pick(headerMap.system_role)) || "employee",
    phone: pick(headerMap.phone),
  };
}

// ── Result type ─────────────────────────────────────────────────────────

type ImportResult = {
  runId: string;
  imported: number;
  failed: number;
  failures: { row: number; email: string; error: string }[];
};

// ── Main component ──────────────────────────────────────────────────────

export function EmployeeImportWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const bulkFn = useServerFn(bulkCreateEmployees);
  const { user } = useAuth();

  // Draft persistence
  const [initialRows, setInitialRows] = useState<EmpRow[] | undefined>(() => {
    if (typeof window === "undefined" || !user) return undefined;
    return loadImportDraft(user.id)?.rows ?? undefined;
  });

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRowsChange = useCallback(
    (rows: EmpRow[]) => {
      if (!user) return;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => saveImportDraft(user.id, rows), 600);
    },
    [user],
  );

  // Column mapping state
  const [rawFile, setRawFile] = useState<{
    headers: string[];
    rows: RawRow[];
    name: string;
  } | null>(null);
  const mappingResolve = useRef<((rows: EmpRow[]) => void) | null>(null);

  const parseFileWithMapping = async (file: File): Promise<EmpRow[]> => {
    let parsed: Awaited<ReturnType<typeof parseAttendanceFile>>;
    try {
      parsed = await parseAttendanceFile(file);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not read file. Check the format and try again.",
      );
      return [];
    }
    if (parsed.rows.length === 0) {
      toast.error("No data rows found in the file.");
      return [];
    }
    setRawFile({ headers: parsed.headers, rows: parsed.rows, name: file.name });
    return new Promise<EmpRow[]>((resolve) => {
      mappingResolve.current = resolve;
    });
  };

  const handleMappingConfirm = (headerMap: Partial<Record<keyof EmpRow, string>>) => {
    if (!rawFile || !mappingResolve.current) return;
    const mapped = rawFile.rows.map((raw) => rawRowToEmpRow(raw, headerMap));
    mappingResolve.current(mapped);
    mappingResolve.current = null;
    setRawFile(null);
  };

  const handleMappingCancel = () => {
    mappingResolve.current?.([]);
    mappingResolve.current = null;
    setRawFile(null);
  };

  // Import result + retry
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parentRunId, setParentRunId] = useState<string | null>(null);
  const lastSubmittedRef = useRef<EmpRow[]>([]);

  const commit = useMutation({
    mutationFn: async (rows: EmpRow[]) => {
      lastSubmittedRef.current = rows;
      const payload = rows.map((r) => {
        const s = toSchemaInput(r);
        return {
          ...s,
          department: s.department as "ops" | "finance" | "hr" | "exec" | null,
          employment_type: s.employment_type as
            | "full_time"
            | "part_time"
            | "contractor"
            | "intern"
            | null,
          system_role: s.system_role as (typeof INTERNAL_ROLES)[number],
        };
      });
      return bulkFn({
        data: { rows: payload, parentRunId, origin: "hr_hub" },
      });
    },
    onSuccess: (r) => {
      if (user) clearImportDraft(user.id);
      setResult(r);
      qc.invalidateQueries({ queryKey: ["hr", "employees"] });
      toast.success(`${r.imported} imported, ${r.failed} failed`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Bulk import failed"),
  });

  const retryFailedRows = () => {
    if (!result || result.failures.length === 0) return;
    const failedEmails = new Set(result.failures.map((f) => f.email.toLowerCase()));
    const failed = lastSubmittedRef.current.filter((r) =>
      failedEmails.has(r.email.trim().toLowerCase()),
    );
    if (failed.length === 0) {
      toast.error("Couldn't reconstruct failed rows — please re-enter them.");
      return;
    }
    setParentRunId(result.runId);
    setInitialRows(failed);
    setResult(null);
    toast.info(`Retrying ${failed.length} previously failed row${failed.length === 1 ? "" : "s"}.`);
  };

  const downloadErrors = () => {
    if (!result) return;
    const header = "row,email,error\n";
    const body = result.failures
      .map((f) => `${f.row},"${f.email}","${f.error.replace(/"/g, "''")}"`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-${result.runId}-errors.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importHint = useMemo(
    () => (
      <span>
        Email, first &amp; last name, Employee ID and System role are required. Accounts are
        provisioned only for valid rows.
      </span>
    ),
    [],
  );

  // Result screen
  if (result) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Run ID" value={result.runId.slice(0, 8) + "…"} />
            <StatCard label="Imported" value={result.imported} tone="ok" />
            <StatCard label="Failed" value={result.failed} tone={result.failed ? "err" : "ok"} />
          </div>
          {result.failed > 0 && (
            <>
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>
                  {result.failed} row{result.failed === 1 ? "" : "s"} failed during provisioning
                </AlertTitle>
                <AlertDescription className="text-xs">
                  Download the error CSV, fix the issues, and retry.
                </AlertDescription>
              </Alert>
              <Card>
                <CardContent className="p-0 max-h-[35vh] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2">Row</th>
                        <th className="text-left px-3 py-2">Email</th>
                        <th className="text-left px-3 py-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failures.map((f) => (
                        <tr key={f.row} className="border-t">
                          <td className="px-3 py-1.5 tabular-nums">{f.row}</td>
                          <td className="px-3 py-1.5">{f.email}</td>
                          <td className="px-3 py-1.5 text-destructive">{f.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
          <div className="flex items-center justify-end gap-2">
            {result.failed > 0 && (
              <>
                <Button variant="outline" onClick={downloadErrors}>
                  <Download className="h-4 w-4" /> Download error CSV
                </Button>
                <Button variant="outline" onClick={retryFailedRows}>
                  <RotateCcw className="h-4 w-4" /> Retry failed rows
                </Button>
              </>
            )}
            <Button onClick={() => navigate({ to: "/hr/employees" })}>
              Done <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Column mapping dialog — shown after a file is parsed, before rows enter the grid */}
      {rawFile && (
        <ColumnMappingDialog
          fileName={rawFile.name}
          rawHeaders={rawFile.headers}
          rowCount={rawFile.rows.length}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
        />
      )}

      <SpreadsheetImport<EmpRow>
        columns={COLUMNS}
        emptyRow={emptyRow}
        validateRow={validateRow}
        onRowsChange={handleRowsChange}
        onImport={async (rows) => {
          await commit.mutateAsync(rows);
        }}
        onParseFile={parseFileWithMapping}
        onDownloadTemplate={downloadEmployeeTemplate}
        initialRows={initialRows}
        busy={commit.isPending}
        hint={importHint}
        importLabel={(n) => `Provision ${n} account${n === 1 ? "" : "s"}`}
      />
    </>
  );
}

// ── Column mapping dialog ───────────────────────────────────────────────

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
  onConfirm: (headerMap: Partial<Record<keyof EmpRow, string>>) => void;
  onCancel: () => void;
}) {
  // Build initial auto-suggestions from HEADER_ALIASES
  const [headerMap, setHeaderMap] = useState<Partial<Record<keyof EmpRow, string>>>(() => {
    const initial: Partial<Record<keyof EmpRow, string>> = {};
    for (const col of COLUMNS) {
      const aliases = HEADER_ALIASES[col.key] ?? [];
      const match = rawHeaders.find((h) => aliases.some((a) => normalizeHeader(h) === a));
      if (match) initial[col.key] = match;
    }
    return initial;
  });

  const setField = (field: keyof EmpRow, value: string) => {
    setHeaderMap((prev) => ({ ...prev, [field]: value === SKIP ? undefined : value }));
  };

  const handleConfirm = () => {
    onConfirm(headerMap);
  };

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
          <DialogTitle className="flex items-center gap-2 flex-wrap">
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
          Match each field below to a column from your file. Required fields are marked with{" "}
          <span className="text-destructive">*</span>.
        </p>

        <div className="space-y-3">
          {COLUMNS.map((col) => (
            <div key={col.key} className="grid grid-cols-2 items-center gap-3">
              <span className="text-sm">
                {col.label}
                {col.required && <span className="ml-0.5 text-destructive">*</span>}
              </span>
              <Select
                value={headerMap[col.key] ?? SKIP}
                onValueChange={(v) => setField(col.key, v)}
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
          <Button size="sm" onClick={handleConfirm}>
            Import {rowCount} row{rowCount === 1 ? "" : "s"} <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
