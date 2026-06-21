import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Settings2,
  Download,
  History,
  RotateCw,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { parseAttendanceFile } from "@/lib/hr/parse-attendance-file";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  validateMapping,
  issuesByField,
  type MappingIssue,
} from "@/components/hr/mapping-validation";
import {
  ImportResultsPanel,
  type ImportResult,
  type ImportedRow,
} from "@/components/hr/import-results-panel";
import {
  createImportRun,
  finalizeImportRun,
  recordRowErrors,
  type RowFailure,
} from "@/lib/hr/import-runs";
import {
  ValidationSummary,
  type ValidationBucket,
  type ValidationBucketId,
} from "@/components/hr/validation-summary";
import { MatchResolver, type UnresolvedGroup } from "@/components/hr/match-resolver";
import { PresetBar } from "@/components/hr/preset-bar";
import {
  buildMatchContext,
  scoreRow,
  aliasKey,
  loadEmployeeAliases,
  type EmployeeProfile,
} from "@/lib/hr/match-employees";
import { listMappingPresets, applyPresetToFile } from "@/lib/hr/mapping-presets";
import { downloadAttendanceTemplate } from "@/lib/hr/csv-templates";

export const Route = createFileRoute("/hr/attendance/import/")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager"]}>
      <AppShell
        crumbs={[
          { label: "Human Resources", to: "/hr/employees" },
          { label: "Attendance", to: "/hr/attendance" },
          { label: "Import" },
        ]}
      >
        <ImportPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type RawRow = Record<string, unknown>;

type GradedRow = {
  rowIndex: number;
  employee_code: string;
  employee_name: string;
  department: string | null;
  designation: string | null;
  entry_date: string; // yyyy-mm-dd
  day_of_week: string | null;
  punch_in: string | null; // ISO
  punch_out: string | null;
  raw_total_hours: string | null;
  raw_break: string | null;
  raw_status: string | null;
  total_minutes_in_office: number;
  auto_status: "present" | "half_day" | "absent";
  is_late_arrival: boolean;
  is_early_checkout: boolean;
  late_by_minutes: number;
  early_by_minutes: number;
  parse_error: string | null;
  warnings: string[];
};

type Policy = {
  id: string;
  standard_start_time: string;
  grace_period_minutes: number;
  standard_end_time: string;
  early_checkout_grace_minutes: number;
  min_hours_full_day: number;
  min_hours_half_day: number;
};

const EXPECTED_HEADERS = [
  "Employee ID",
  "Employee Name",
  "Department",
  "Designation",
  "Date",
  "Day",
  "Punch In",
  "Punch Out",
  "Total Working Hours",
  "Total Break",
  "Status",
];

// Required core columns. Others are optional and will degrade gracefully.
const REQUIRED_HEADERS = ["Employee Name", "Date"];

// Header alias map: normalized canonical key -> list of accepted variants
// (also normalized). Comparison is case + whitespace + punctuation insensitive.
const HEADER_ALIASES: Record<string, string[]> = {
  "Employee ID": ["employee id", "emp id", "empid", "employee code", "emp code", "code", "id"],
  "Employee Name": ["employee name", "emp name", "name", "employee", "full name"],
  Department: ["department", "dept", "department name"],
  Designation: ["designation", "title", "role", "position"],
  Date: ["date", "attendance date", "punch date", "day date"],
  Day: ["day", "weekday", "day of week"],
  "Punch In": ["punch in", "in time", "in", "check in", "checkin", "first in", "time in"],
  "Punch Out": ["punch out", "out time", "out", "check out", "checkout", "last out", "time out"],
  "Total Working Hours": [
    "total working hours",
    "working hours",
    "work hours",
    "total hours",
    "hours",
    "duration",
    "total time",
  ],
  "Total Break": ["total break", "break", "break time", "break hours", "break duration"],
  Status: ["status", "attendance status", "remark", "remarks"],
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[\s_\-./]+/g, " ")
    .trim();
}

// Build a lookup from any raw header in the file -> canonical key
function buildHeaderMap(rawHeaders: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of rawHeaders) {
    const norm = normalizeHeader(raw);
    for (const [canonical, variants] of Object.entries(HEADER_ALIASES)) {
      if (variants.includes(norm) || normalizeHeader(canonical) === norm) {
        out[canonical] = raw;
        break;
      }
    }
  }
  return out;
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    // Use UTC components — XLSX serial dates are anchored to UTC midnight.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Excel serial date (when xlsx returns raw numbers)
  if (typeof v === "number" && Number.isFinite(v)) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const s = String(v).trim();
  if (!s || s === "-") return null;
  // dd-mm-yyyy or dd/mm/yyyy or dd.mm.yyyy
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // yyyy-mm-dd or yyyy/mm/dd
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // dd-mm-yy / dd/mm/yy — assume DD-MM and 20YY (HR exports are DMY in this region).
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) {
    const yy = parseInt(m[3], 10);
    const yyyy = yy < 70 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // ISO datetime — strip the time portion
  m = s.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (m) return m[1];
  // Last resort: native parse (locale-dependent; only triggers for things like "01 May 2026")
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function FormatTester() {
  const [dateInput, setDateInput] = useState("01-05-2026");
  const [punchIn, setPunchIn] = useState("09:00");
  const [punchOut, setPunchOut] = useState("6:05 PM");
  const parsedDate = parseDate(dateInput);
  const parsedIn = parseTimeOfDay(punchIn);
  const parsedOut = parseTimeOfDay(punchOut);
  const fmtTime = (t: { h: number; m: number } | null) =>
    t ? `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}` : null;
  const Result = ({ ok, value }: { ok: boolean; value: string | null }) => (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs ${ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {ok ? value : "Could not parse"}
    </span>
  );
  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Format tester</div>
        <div className="text-[11px] text-muted-foreground">
          Try a value to see how it will be parsed
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Date</label>
          <Input
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            placeholder="DD-MM-YYYY"
            className="h-8 text-xs"
          />
          <div className="text-xs">
            → <Result ok={!!parsedDate} value={parsedDate} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Punch In</label>
          <Input
            value={punchIn}
            onChange={(e) => setPunchIn(e.target.value)}
            placeholder="HH:MM"
            className="h-8 text-xs"
          />
          <div className="text-xs">
            → <Result ok={!!parsedIn} value={fmtTime(parsedIn)} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Punch Out</label>
          <Input
            value={punchOut}
            onChange={(e) => setPunchOut(e.target.value)}
            placeholder="HH:MM or h:mm AM/PM"
            className="h-8 text-xs"
          />
          <div className="text-xs">
            → <Result ok={!!parsedOut} value={fmtTime(parsedOut)} />
          </div>
        </div>
      </div>
      {parsedDate && parsedIn && parsedOut && (
        <div className="text-[11px] text-muted-foreground">
          Combined check-in:{" "}
          <span className="font-mono">
            {parsedDate} {fmtTime(parsedIn)} IST
          </span>{" "}
          · check-out:{" "}
          <span className="font-mono">
            {parsedDate} {fmtTime(parsedOut)} IST
          </span>
        </div>
      )}
    </div>
  );
}

function parseTimeOfDay(v: unknown): { h: number; m: number } | null {
  if (v == null) return null;
  // Excel cell with cellDates=true returns a Date anchored to 1899-12-30.
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return { h: v.getUTCHours(), m: v.getUTCMinutes() };
  }
  // Excel time fraction (0–1 = portion of a day)
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 2) {
    const totalMin = Math.round(v * 24 * 60);
    return { h: Math.floor(totalMin / 60) % 24, m: totalMin % 60 };
  }
  let s = String(v).trim();
  if (!s || s === "-" || s === "--" || /^(absent|leave|off|holiday)$/i.test(s)) return null;
  // Strip trailing seconds: "9:00:00" -> "9:00"
  s = s.replace(/^(\d{1,2}):(\d{2}):\d{2}(\s*(AM|PM))?$/i, "$1:$2$3");
  // "9.30" -> "9:30"
  s = s.replace(/^(\d{1,2})\.(\d{2})(\s*(AM|PM))?$/i, "$1:$2$3");
  // "9 30" -> "9:30"
  s = s.replace(/^(\d{1,2})\s+(\d{2})(\s*(AM|PM))?$/i, "$1:$2$3");
  // "0900" / "930" military -> "09:00" / "9:30"
  let mil = s.match(/^(\d{3,4})$/);
  if (mil) {
    const padded = mil[1].padStart(4, "0");
    s = `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }
  // "9 AM" / "9am" (no minutes) -> "9:00 AM"
  s = s.replace(/^(\d{1,2})\s*(AM|PM)$/i, "$1:00 $2");

  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

function combineDateTime(date: string, t: { h: number; m: number }): string {
  // Interpret as IST (+05:30)
  const iso = `${date}T${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}:00+05:30`;
  return new Date(iso).toISOString();
}

function addMinutesToTime(time: string, delta: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + delta + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function policyMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function gradeRow(
  raw: RawRow,
  idx: number,
  policy: Policy,
  headerMap: Record<string, string>,
): GradedRow {
  const get = (canonical: string): unknown => {
    const realKey = headerMap[canonical];
    if (realKey != null && realKey in raw) return raw[realKey];
    // Fallback: direct key (in case header was already canonical)
    return raw[canonical];
  };
  const str = (v: unknown) => (v == null ? "" : String(v).trim());

  const employee_code = str(get("Employee ID"));
  const employee_name = str(get("Employee Name"));
  const department = str(get("Department")) || null;
  const designation = str(get("Designation")) || null;
  const entry_date = parseDate(get("Date"));
  const day_of_week = str(get("Day")) || null;
  const inRaw = get("Punch In");
  const outRaw = get("Punch Out");
  const inT = parseTimeOfDay(inRaw);
  const outT = parseTimeOfDay(outRaw);
  const raw_total_hours = str(get("Total Working Hours")) || null;
  const raw_break = str(get("Total Break")) || null;
  const raw_status = str(get("Status")) || null;

  const errors: string[] = [];
  const warnings: string[] = [];
  if (!employee_name) errors.push("Missing employee name");
  if (!entry_date) errors.push(`Unparseable date: "${str(get("Date"))}"`);
  // Treat blank, "-", "--" as legitimately empty (not a parse failure).
  const isBlankPunch = (v: unknown) => {
    const s = str(v);
    return !s || s === "-" || s === "--" || /^(absent|leave|off|holiday)$/i.test(s);
  };
  if (!isBlankPunch(inRaw) && !inT) warnings.push(`Could not parse Punch In: "${str(inRaw)}"`);
  if (!isBlankPunch(outRaw) && !outT) warnings.push(`Could not parse Punch Out: "${str(outRaw)}"`);
  if (inT && !outT && !isBlankPunch(outRaw)) warnings.push("Missing punch out");
  if (!inT && outT && !isBlankPunch(inRaw)) warnings.push("Missing punch in");

  const punch_in = entry_date && inT ? combineDateTime(entry_date, inT) : null;
  const punch_out = entry_date && outT ? combineDateTime(entry_date, outT) : null;

  let total = 0;
  if (punch_in && punch_out) {
    total = Math.max(
      0,
      Math.round((new Date(punch_out).getTime() - new Date(punch_in).getTime()) / 60000),
    );
  }

  const fullMin = policy.min_hours_full_day * 60;
  const halfMin = policy.min_hours_half_day * 60;
  let auto_status: GradedRow["auto_status"] = "absent";
  if (total >= fullMin) auto_status = "present";
  else if (total >= halfMin) auto_status = "half_day";

  let is_late_arrival = false;
  let late_by_minutes = 0;
  if (inT) {
    const startMin = policyMinutes(policy.standard_start_time) + policy.grace_period_minutes;
    const punchMin = inT.h * 60 + inT.m;
    if (punchMin > startMin) {
      is_late_arrival = true;
      late_by_minutes = punchMin - policyMinutes(policy.standard_start_time);
    }
  }

  let is_early_checkout = false;
  let early_by_minutes = 0;
  if (outT) {
    const endMin = policyMinutes(policy.standard_end_time) - policy.early_checkout_grace_minutes;
    const punchMin = outT.h * 60 + outT.m;
    if (punchMin < endMin && auto_status !== "absent") {
      is_early_checkout = true;
      early_by_minutes = policyMinutes(policy.standard_end_time) - punchMin;
    }
  }

  return {
    rowIndex: idx,
    employee_code,
    employee_name,
    department,
    designation,
    entry_date: entry_date ?? "",
    day_of_week,
    punch_in,
    punch_out,
    raw_total_hours,
    raw_break,
    raw_status,
    total_minutes_in_office: total,
    auto_status,
    is_late_arrival,
    is_early_checkout,
    late_by_minutes,
    early_by_minutes,
    parse_error: errors.length ? errors.join(", ") : null,
    warnings,
  };
}

function fmtMins(n: number) {
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h}h ${m}m`;
}

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    toast.info("Nothing to export");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(",")]
    .concat(
      rows.map((r) =>
        headers
          .map((h) => {
            const v = r[h];
            if (v == null) return "";
            const s = String(v).replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      ),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [userHeaderMap, setUserHeaderMap] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseStage, setParseStage] = useState<string>("");
  const [grading, setGrading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<
    "all" | "present" | "half_day" | "absent" | "late" | "early"
  >("all");
  const [activeBucket, setActiveBucket] = useState<ValidationBucketId | null>(null);
  const [commitProgress, setCommitProgress] = useState({ done: 0, total: 0, stage: "" });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [retryingResult, setRetryingResult] = useState(false);
  const [matchOverrides, setMatchOverrides] = useState<Record<string, string>>({});
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [defaultPresetApplied, setDefaultPresetApplied] = useState(false);
  const [skipUnmatched, setSkipUnmatched] = useState(false);

  const policyQ = useQuery({
    queryKey: ["hr-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_hr_settings")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data as Policy | null;
    },
  });

  const policy: Policy | null = useMemo(() => {
    const p = policyQ.data;
    if (!p) return null;
    return {
      ...p,
      standard_start_time: String(p.standard_start_time).slice(0, 5),
      standard_end_time: String(p.standard_end_time).slice(0, 5),
      min_hours_full_day: Number(p.min_hours_full_day),
      min_hours_half_day: Number(p.min_hours_half_day),
    };
  }, [policyQ.data]);

  // headerMap is owned by the user via the Step 2 mapping UI. Step 1 seeds it
  // from buildHeaderMap() so common biometric exports are one click away.
  const headerMap = userHeaderMap;

  const mappingIssues: MappingIssue[] = useMemo(() => {
    if (rawHeaders.length === 0) return [];
    return validateMapping({
      mapping: headerMap,
      required: REQUIRED_HEADERS,
      rawHeaders,
      sampleRows: rawRows,
      dateParser: parseDate,
    });
  }, [headerMap, rawHeaders, rawRows]);

  const mappingIssuesByField = useMemo(() => issuesByField(mappingIssues), [mappingIssues]);
  const mappingHasErrors = mappingIssues.some((i) => i.severity === "error");

  // Last failed run (for the retry banner on the landing step).
  const lastFailedRunQ = useQuery({
    queryKey: ["attendance-import-last-failed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_import_runs")
        .select("id, file_name, failed_rows, started_at")
        .gt("failed_rows", 0)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const graded: GradedRow[] = useMemo(() => {
    if (!policy) return [];
    return rawRows.map((r, i) => gradeRow(r, i, policy, headerMap));
  }, [rawRows, policy, headerMap]);

  const counts = useMemo(() => {
    return {
      total: graded.length,
      present: graded.filter((r) => r.auto_status === "present").length,
      half_day: graded.filter((r) => r.auto_status === "half_day").length,
      absent: graded.filter((r) => r.auto_status === "absent").length,
      late: graded.filter((r) => r.is_late_arrival).length,
      early: graded.filter((r) => r.is_early_checkout).length,
      errors: graded.filter((r) => r.parse_error).length,
      warnings: graded.filter((r) => !r.parse_error && r.warnings.length > 0).length,
    };
  }, [graded]);

  const issues = useMemo(
    () => graded.filter((r) => r.parse_error || r.warnings.length > 0),
    [graded],
  );

  // Per-row bucket membership — used both for the summary counts and for filtering.
  function rowBuckets(r: GradedRow, matchedId: string | null): ValidationBucketId[] {
    const out: ValidationBucketId[] = [];
    const pe = r.parse_error ?? "";
    if (/Missing employee name/i.test(pe)) out.push("missing_name");
    if (/Unparseable date/i.test(pe)) out.push("invalid_date");
    for (const w of r.warnings) {
      if (/Could not parse Punch (In|Out)/i.test(w) || /Missing punch/i.test(w))
        out.push("invalid_time");
    }
    if (r.is_late_arrival) out.push("late_arrival");
    if (r.is_early_checkout) out.push("early_checkout");
    if (!r.parse_error) {
      if (r.auto_status === "absent" && (r.punch_in || r.punch_out)) out.push("below_half_day");
      else if (r.auto_status === "half_day") out.push("below_full_day");
    }
    if (!r.parse_error && r.entry_date && !matchedId) out.push("unmatched_employee");
    return out;
  }

  const filtered = useMemo(() => {
    return graded.filter((r) => {
      if (filterStatus === "all") return true;
      if (filterStatus === "late") return r.is_late_arrival;
      if (filterStatus === "early") return r.is_early_checkout;
      return r.auto_status === filterStatus;
    });
  }, [graded, filterStatus]);

  function exportPreviewCsv() {
    const rows = filtered.map((r) => ({
      employee_code: r.employee_code,
      employee_name: r.employee_name,
      department: r.department ?? "",
      designation: r.designation ?? "",
      entry_date: r.entry_date,
      day: r.day_of_week ?? "",
      punch_in: r.punch_in
        ? new Date(r.punch_in).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
        : "",
      punch_out: r.punch_out
        ? new Date(r.punch_out).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
        : "",
      total_hours: r.total_minutes_in_office ? (r.total_minutes_in_office / 60).toFixed(2) : "",
      auto_status: r.auto_status,
      late_by_minutes: r.is_late_arrival ? r.late_by_minutes : "",
      early_by_minutes: r.is_early_checkout ? r.early_by_minutes : "",
      issues: [r.parse_error ?? "", ...r.warnings].filter(Boolean).join(" | "),
    }));
    downloadCsv(
      `attendance-preview-${filterStatus}-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
    );
  }

  function exportErrorReport() {
    const rows = issues.map((r) => ({
      row: r.rowIndex + 2, // +1 for header, +1 for 1-indexed
      employee_code: r.employee_code,
      employee_name: r.employee_name,
      entry_date: r.entry_date,
      severity: r.parse_error ? "error" : "warning",
      issue: [r.parse_error ?? "", ...r.warnings].filter(Boolean).join(" | "),
    }));
    downloadCsv(`attendance-import-errors-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    setPendingFile(file);
    setFileName(file.name);
    setParsing(true);
    setParseProgress(5);
    setParseStage(ext === "csv" ? "Streaming CSV…" : "Parsing spreadsheet in worker…");
    try {
      const { headers, rows } = await parseAttendanceFile(file, ({ stage, percent, rows }) => {
        setParseStage(rows != null ? `${stage} (${rows.toLocaleString()} rows)` : stage);
        setParseProgress(percent);
      });
      if (rows.length === 0) {
        toast.error("No rows found in file");
        setParsing(false);
        setPendingFile(null);
        return;
      }
      const autoMap = buildHeaderMap(headers);
      const missingRequired = REQUIRED_HEADERS.filter((h) => !autoMap[h]);
      if (missingRequired.length > 0) {
        toast.warning(
          `Couldn't auto-detect: ${missingRequired.join(", ")}. Pick them manually in the next step.`,
          { duration: 6000 },
        );
      }
      setRawRows(rows);
      setRawHeaders(headers);
      setUserHeaderMap(autoMap);
      setParseProgress(100);
      setParseStage("Done");
      setStep(2);
      toast.success(`Loaded ${rows.length.toLocaleString()} rows`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to parse file");
      setPendingFile(null);
    } finally {
      setTimeout(() => {
        setParsing(false);
        setParseProgress(0);
        setParseStage("");
      }, 250);
    }
  }

  function downloadSampleTemplate() {
    const sampleRows = [
      [
        "EMP001",
        "Jane Doe",
        "Engineering",
        "Software Engineer",
        "2026-05-01",
        "Friday",
        "09:00",
        "18:05",
        "9.08",
        "1.00",
        "Present",
      ],
      [
        "EMP001",
        "Jane Doe",
        "Engineering",
        "Software Engineer",
        "2026-05-02",
        "Saturday",
        "09:15",
        "17:30",
        "8.25",
        "0.75",
        "Present",
      ],
      [
        "EMP002",
        "John Smith",
        "Sales",
        "Account Manager",
        "2026-05-01",
        "Friday",
        "-",
        "-",
        "0",
        "0",
        "Absent",
      ],
      [
        "EMP002",
        "John Smith",
        "Sales",
        "Account Manager",
        "2026-05-02",
        "Saturday",
        "10:30",
        "15:00",
        "4.50",
        "0.50",
        "Half Day",
      ],
    ];
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [
      EXPECTED_HEADERS.map(escape).join(","),
      ...sampleRows.map((r) => r.map(escape).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendance_import_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Sample template downloaded");
  }

  // Match preview: load profiles + aliases once and score each row.
  const profilesQ = useQuery({
    queryKey: ["import-profiles-match"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as EmployeeProfile[];
    },
  });

  const aliasesQ = useQuery({
    queryKey: ["attendance-employee-aliases"],
    queryFn: loadEmployeeAliases,
  });

  const presetsQ = useQuery({
    queryKey: ["attendance-mapping-presets"],
    queryFn: listMappingPresets,
  });

  const matchContext = useMemo(
    () => buildMatchContext(profilesQ.data ?? [], aliasesQ.data ?? []),
    [profilesQ.data, aliasesQ.data],
  );

  // Per-row match results (memoised).
  const rowMatches = useMemo(() => {
    return graded.map((r) =>
      scoreRow({ employee_code: r.employee_code, employee_name: r.employee_name }, matchContext),
    );
  }, [graded, matchContext]);

  function resolveEmployeeId(r: GradedRow, idx: number): string | null {
    const key = aliasKey(r.employee_code, r.employee_name);
    if (matchOverrides[key]) return matchOverrides[key];
    return rowMatches[idx]?.employee_id ?? null;
  }

  // Group unresolved + low-confidence rows for the resolver UI.
  const unresolvedGroups: UnresolvedGroup[] = useMemo(() => {
    const map = new Map<string, UnresolvedGroup>();
    for (let i = 0; i < graded.length; i++) {
      const r = graded[i];
      if (r.parse_error || !r.entry_date) continue;
      const m = rowMatches[i];
      if (!m || (m.confidence !== "unmatched" && m.confidence !== "fuzzy_name")) continue;
      const key = aliasKey(r.employee_code, r.employee_name);
      const existing = map.get(key);
      if (existing) {
        existing.rowCount += 1;
      } else {
        map.set(key, {
          key,
          employee_code: r.employee_code,
          employee_name: r.employee_name,
          rowCount: 1,
          confidence: m.confidence,
          candidates: m.candidates,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.rowCount - a.rowCount);
  }, [graded, rowMatches]);

  const matchCounts = useMemo(() => {
    let matched = 0;
    for (let i = 0; i < graded.length; i++) {
      const r = graded[i];
      if (r.parse_error || !r.entry_date) continue;
      if (resolveEmployeeId(r, i)) matched += 1;
    }
    return { matched, unmatched: counts.total - counts.errors - matched };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graded, rowMatches, matchOverrides, counts]);

  // Validation buckets for the summary card. Counts derived from the same
  // rowBuckets() helper used by the table filter so the two stay in sync.
  const validationBuckets: ValidationBucket[] = useMemo(() => {
    const tally: Record<ValidationBucketId, number> = {
      missing_name: 0,
      unmatched_employee: 0,
      invalid_date: 0,
      invalid_time: 0,
      late_arrival: 0,
      early_checkout: 0,
      below_half_day: 0,
      below_full_day: 0,
      db_insert_error: 0,
    };
    for (let i = 0; i < graded.length; i++) {
      const matched = resolveEmployeeId(graded[i], i);
      for (const b of rowBuckets(graded[i], matched)) tally[b] += 1;
    }
    if (importResult) tally.db_insert_error = importResult.failures.length;
    const lateGrace = policy
      ? `Late = check-in after ${addMinutesToTime(policy.standard_start_time, policy.grace_period_minutes)}`
      : undefined;
    const earlyGrace = policy
      ? `Early = check-out before ${addMinutesToTime(policy.standard_end_time, -policy.early_checkout_grace_minutes)}`
      : undefined;
    return [
      {
        id: "missing_name",
        label: "Missing employee name",
        count: tally.missing_name,
        tone: "destructive",
        threshold: "Required field",
      },
      {
        id: "unmatched_employee",
        label: "Employee not matched",
        count: tally.unmatched_employee,
        tone: "warning",
        threshold: "No profile match by code, email, or name",
      },
      {
        id: "invalid_date",
        label: "Invalid date",
        count: tally.invalid_date,
        tone: "destructive",
        threshold: "Couldn't parse the Date column",
      },
      {
        id: "invalid_time",
        label: "Invalid punch time",
        count: tally.invalid_time,
        tone: "warning",
        threshold: "Couldn't parse Punch In/Out",
      },
      {
        id: "late_arrival",
        label: "Late arrival",
        count: tally.late_arrival,
        tone: "warning",
        threshold: lateGrace,
      },
      {
        id: "early_checkout",
        label: "Early checkout",
        count: tally.early_checkout,
        tone: "info",
        threshold: earlyGrace,
      },
      {
        id: "below_half_day",
        label: "Below half-day threshold",
        count: tally.below_half_day,
        tone: "warning",
        threshold: policy ? `Half-day ≥ ${policy.min_hours_half_day}h` : undefined,
      },
      {
        id: "below_full_day",
        label: "Below full-day threshold",
        count: tally.below_full_day,
        tone: "info",
        threshold: policy ? `Full-day ≥ ${policy.min_hours_full_day}h` : undefined,
      },
      {
        id: "db_insert_error",
        label: "Database insert failed",
        count: tally.db_insert_error,
        tone: "destructive",
        threshold: "Row was rejected by the database",
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graded, rowMatches, matchOverrides, policy, importResult]);

  // Apply the active bucket as a secondary filter on top of `filtered`.
  const filteredByBucket = useMemo(() => {
    if (!activeBucket) return filtered;
    return filtered.filter((r) => {
      const idx = r.rowIndex;
      const matched = resolveEmployeeId(r, idx);
      return rowBuckets(r, matched).includes(activeBucket);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, activeBucket, rowMatches, matchOverrides]);

  // Auto-apply default preset when a file is freshly loaded.
  useEffect(() => {
    if (defaultPresetApplied) return;
    if (rawHeaders.length === 0) return;
    const presets = presetsQ.data ?? [];
    const def = presets.find((p) => p.is_default);
    if (!def) return;
    const { applied, missing } = applyPresetToFile(def, rawHeaders);
    if (Object.keys(applied).length === 0) return;
    setUserHeaderMap(applied);
    setSelectedPresetId(def.id);
    setDefaultPresetApplied(true);
    if (missing.length === 0) toast.success(`Applied default preset "${def.name}"`);
    else
      toast.message(
        `Applied default preset "${def.name}" — ${missing.length} column(s) not in file`,
      );
  }, [rawHeaders, presetsQ.data, defaultPresetApplied]);

  // Map our graded auto_status + flags to attendance_status enum.
  function toAttendanceStatus(r: GradedRow): "present" | "absent" | "late" | "half_day" {
    if (r.auto_status === "absent") return "absent";
    if (r.auto_status === "half_day") return "half_day";
    if (r.is_late_arrival) return "late";
    return "present";
  }

  const commit = useMutation({
    mutationFn: async () => {
      if (!policy) throw new Error("Policy not loaded");
      // Filter out rows with parse errors. Optionally also drop unmatched rows.
      const filteredValid: Array<{ row: GradedRow; origIdx: number }> = [];
      for (let i = 0; i < graded.length; i++) {
        const r = graded[i];
        if (r.parse_error || !r.entry_date) continue;
        if (skipUnmatched && !resolveEmployeeId(r, i)) continue;
        filteredValid.push({ row: r, origIdx: i });
      }
      if (filteredValid.length === 0) throw new Error("No valid rows to commit");
      const startedAt = Date.now();
      setCommitProgress({ done: 0, total: filteredValid.length, stage: "Matching employees…" });
      const { data: u } = await supabase.auth.getUser();
      const batchId = crypto.randomUUID();

      // Open the import-run record first so we can tag each row with run_id.
      const runId = await createImportRun({
        file_name: fileName || "import",
        file_size: pendingFile?.size ?? null,
        mapping: headerMap,
        total_rows: filteredValid.length,
      });

      const enriched = filteredValid.map(({ row: r, origIdx }) => ({
        row: r,
        origIdx,
        matched_employee_id: resolveEmployeeId(r, origIdx),
      }));
      const matchedCount = enriched.filter((e) => e.matched_employee_id).length;
      const payload = enriched.map(({ row: r, matched_employee_id }) => ({
        employee_code: r.employee_code || null,
        employee_name: r.employee_name,
        department: r.department,
        designation: r.designation,
        entry_date: r.entry_date,
        day_of_week: r.day_of_week,
        punch_in: r.punch_in,
        punch_out: r.punch_out,
        raw_total_hours: r.raw_total_hours,
        raw_break: r.raw_break,
        raw_status: r.raw_status,
        total_minutes_in_office: r.total_minutes_in_office,
        auto_status: r.auto_status,
        is_late_arrival: r.is_late_arrival,
        is_early_checkout: r.is_early_checkout,
        late_by_minutes: r.late_by_minutes,
        early_by_minutes: r.early_by_minutes,
        applied_settings_id: policy.id,
        import_batch_id: batchId,
        import_run_id: runId,
        matched_employee_id,
        created_by: u.user?.id ?? null,
      }));

      const CHUNK = 500;
      const total = payload.length;
      let inserted = 0;
      const rowFailures: RowFailure[] = [];
      const succeededRows: ImportedRow[] = [];
      const pushSucceeded = (row: (typeof payload)[number], id: string | null) => {
        succeededRows.push({
          id,
          employee_code: row.employee_code,
          employee_name: row.employee_name,
          entry_date: row.entry_date,
          punch_in: row.punch_in,
          punch_out: row.punch_out,
          total_hours: row.total_minutes_in_office
            ? (row.total_minutes_in_office / 60).toFixed(2)
            : "",
          attendance_status: row.auto_status,
          is_late_arrival: row.is_late_arrival,
          late_by_minutes: row.late_by_minutes,
          is_early_checkout: row.is_early_checkout,
          early_by_minutes: row.early_by_minutes,
        });
      };
      for (let i = 0; i < total; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        setCommitProgress({
          done: i,
          total,
          stage: `Inserting batch ${Math.floor(i / CHUNK) + 1} of ${Math.ceil(total / CHUNK)}…`,
        });
        const { data: insertedRows, error } = await supabase
          .from("attendance_logs")
          .insert(slice)
          .select("id");
        if (error) {
          setCommitProgress({
            done: i,
            total,
            stage: `Batch ${Math.floor(i / CHUNK) + 1} failed — retrying row-by-row…`,
          });
          for (let j = 0; j < slice.length; j++) {
            const row = slice[j];
            const { data: oneInserted, error: rowErr } = await supabase
              .from("attendance_logs")
              .insert([row])
              .select("id");
            if (rowErr) {
              rowFailures.push({
                row: i + j + 2,
                employee_name: row.employee_name,
                entry_date: row.entry_date,
                error: `${rowErr.message}${rowErr.details ? ` · ${rowErr.details}` : ""}`,
                payload: row as unknown as Record<string, unknown>,
              });
            } else {
              inserted += 1;
              pushSucceeded(row, oneInserted?.[0]?.id ?? null);
            }
          }
        } else {
          inserted += slice.length;
          for (let j = 0; j < slice.length; j++) {
            pushSucceeded(slice[j], insertedRows?.[j]?.id ?? null);
          }
        }
        setCommitProgress({ done: Math.min(i + CHUNK, total), total, stage: "Inserting…" });
        // Yield to the browser so the progress bar repaints.
        await new Promise((r) => setTimeout(r, 0));
      }

      // Now upsert attendance_entries for matched rows so the Attendance page reflects them.
      const entryRows = enriched
        .filter((e) => e.matched_employee_id)
        .map(({ row: r, matched_employee_id }) => ({
          employee_id: matched_employee_id!,
          entry_date: r.entry_date,
          check_in: r.punch_in,
          check_out: r.punch_out,
          status: toAttendanceStatus(r),
          notes:
            [
              r.raw_status ? `Imported status: ${r.raw_status}` : null,
              r.is_late_arrival ? `Late by ${r.late_by_minutes}m` : null,
              r.is_early_checkout ? `Early by ${r.early_by_minutes}m` : null,
            ]
              .filter(Boolean)
              .join(" · ") || null,
        }));

      let entriesUpserted = 0;
      const entryFailed: string[] = [];
      if (entryRows.length > 0) {
        setCommitProgress({
          done: total,
          total,
          stage: `Syncing ${entryRows.length} attendance entries…`,
        });
        for (let i = 0; i < entryRows.length; i += CHUNK) {
          const slice = entryRows.slice(i, i + CHUNK);
          const { error } = await supabase
            .from("attendance_entries")
            .upsert(slice, { onConflict: "employee_id,entry_date" });
          if (error)
            entryFailed.push(`${i + 1}–${Math.min(i + CHUNK, entryRows.length)}: ${error.message}`);
          else entriesUpserted += slice.length;
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      setCommitProgress({ done: total, total, stage: "Done" });

      // Finalize the run record + persist row errors so they're retryable later.
      if (runId) {
        await recordRowErrors(runId, rowFailures);
        await finalizeImportRun(
          runId,
          rowFailures.length === payload.length ? "failed" : "completed",
          {
            inserted_rows: inserted,
            failed_rows: rowFailures.length,
            notes: entryFailed.length
              ? `attendance_entries: ${entryFailed.length} batch(es) failed to sync`
              : null,
          },
        );
      }

      return {
        runId,
        inserted,
        matchedCount,
        entriesUpserted,
        unmatched: total - matchedCount,
        entryFailed,
        rowFailures,
        succeeded: succeededRows,
        startedAt,
      };
    },
    onSuccess: (res) => {
      const failed = res.rowFailures.length;
      if (failed > 0) {
        toast.warning(`${res.inserted} rows committed · ${failed} failed — see panel below.`);
      } else {
        toast.success(
          `Committed ${res.inserted} rows · matched ${res.matchedCount} employees · synced ${res.entriesUpserted} attendance entries`,
        );
      }
      if (res.entryFailed.length > 0) {
        toast.warning(`${res.entryFailed.length} attendance-entry batch(es) failed to sync.`);
      }
      qc.invalidateQueries({ queryKey: ["attendance-logs"] });
      qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
      qc.invalidateQueries({ queryKey: ["attendance-import-runs"] });
      qc.invalidateQueries({ queryKey: ["attendance-import-last-failed"] });

      setImportResult({
        runId: res.runId,
        fileName: fileName || "import",
        inserted: res.inserted,
        matchedCount: res.matchedCount,
        entriesUpserted: res.entriesUpserted,
        failures: res.rowFailures,
        succeeded: res.succeeded,
        startedAt: res.startedAt,
        finishedAt: Date.now(),
      });

      setTimeout(() => setCommitProgress({ done: 0, total: 0, stage: "" }), 1000);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setCommitProgress((p) => ({ ...p, stage: `Failed: ${e.message}` }));
    },
  });

  function resetImporter() {
    setRawRows([]);
    setRawHeaders([]);
    setUserHeaderMap({});
    setPendingFile(null);
    setFileName("");
    setImportResult(null);
    setMatchOverrides({});
    setActiveBucket(null);
    setSelectedPresetId(null);
    setDefaultPresetApplied(false);
    setSkipUnmatched(false);
    setStep(1);
  }

  // Reset retry flag once nothing is running.
  useEffect(() => {
    if (!commit.isPending) setRetryingResult(false);
  }, [commit.isPending]);

  async function retryFailedRowsFromResult() {
    if (!importResult || importResult.failures.length === 0) return;
    setRetryingResult(true);
    const parent = importResult.runId;
    const newRunId = await createImportRun({
      file_name: importResult.fileName,
      file_size: pendingFile?.size ?? null,
      mapping: headerMap,
      total_rows: importResult.failures.length,
      parent_run_id: parent,
    });
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id ?? null;
    let inserted = 0;
    const newFailures: RowFailure[] = [];
    for (const f of importResult.failures) {
      const row = { ...f.payload, created_by: userId };
      const { error } = await (
        supabase.from("attendance_logs") as unknown as {
          insert: (s: unknown) => Promise<{ error: { message: string; details?: string } | null }>;
        }
      ).insert([row]);
      if (error) {
        newFailures.push({
          ...f,
          error: `${error.message}${error.details ? ` · ${error.details}` : ""}`,
        });
      } else {
        inserted += 1;
      }
    }
    if (newRunId) {
      await recordRowErrors(newRunId, newFailures);
      await finalizeImportRun(newRunId, "completed", {
        inserted_rows: inserted,
        failed_rows: newFailures.length,
        notes: `Retry of run ${parent ?? "(unknown)"}`,
      });
    }
    qc.invalidateQueries({ queryKey: ["attendance-import-runs"] });
    qc.invalidateQueries({ queryKey: ["attendance-import-last-failed"] });
    setImportResult({
      ...importResult,
      runId: newRunId ?? importResult.runId,
      inserted: importResult.inserted + inserted,
      failures: newFailures,
      finishedAt: Date.now(),
    });
    setRetryingResult(false);
    toast.success(`Retried — ${inserted} succeeded, ${newFailures.length} still failing`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance CSV Import"
        description="Upload a punch-card export and auto-grade every row using the active attendance policy."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadAttendanceTemplate()}
              title="Download CSV template"
              aria-label="Download CSV template"
            >
              <Download className="h-4 w-4" /> Template
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/hr/attendance/import/history">
                <History className="h-4 w-4" /> Import history
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/settings">
                <Settings2 className="h-4 w-4" /> Edit policy
              </Link>
            </Button>
          </div>
        }
      />

      {importResult
        ? null
        : step === 1 &&
          lastFailedRunQ.data &&
          lastFailedRunQ.data.failed_rows > 0 && (
            <Card className="border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10">
              <CardContent className="p-3 flex flex-wrap items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>
                  Last import <span className="font-medium">{lastFailedRunQ.data.file_name}</span>{" "}
                  had {lastFailedRunQ.data.failed_rows} failed row
                  {lastFailedRunQ.data.failed_rows === 1 ? "" : "s"}.
                </span>
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <Link
                    to="/hr/attendance/import/history/$runId"
                    params={{ runId: lastFailedRunQ.data.id }}
                  >
                    <RotateCw className="h-3.5 w-3.5" /> Review &amp; retry
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

      {importResult ? (
        <ImportResultsPanel
          result={importResult}
          onDismiss={resetImporter}
          onRetry={importResult.failures.length > 0 ? retryFailedRowsFromResult : undefined}
          retrying={retryingResult}
          validationSummary={
            <ValidationSummary
              buckets={validationBuckets}
              title="Why rows failed or were flagged"
            />
          }
        />
      ) : (
        <>
          <Stepper step={step} busy={parsing || grading || commit.isPending} />

          {policyQ.isLoading ? (
            <Skeleton className="h-32" />
          ) : !policy ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No active attendance policy. Configure one in Admin → Settings first.
              </CardContent>
            </Card>
          ) : (
            <>
              <PolicyBanner policy={policy} />

              {step === 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Upload className="h-4 w-4" /> Upload file
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-sm text-muted-foreground flex-1 min-w-[260px]">
                        Drop a punch-card export. CSV files are parsed with PapaParse, Excel files
                        with SheetJS — entirely in your browser. The raw file never leaves this
                        device.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={downloadSampleTemplate}
                      >
                        <Download className="h-4 w-4" /> Download sample CSV
                      </Button>
                    </div>
                    <FileDropzone
                      accept=".xlsx,.xls,.csv"
                      disabled={parsing}
                      onFile={(f) => handleFile(f)}
                      hint={<>.xlsx, .xls or .csv · max 10 MB</>}
                    />
                    {parsing && (
                      <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 font-medium">
                            <Loader2 className="h-3 w-3 animate-spin" /> {parseStage}
                          </span>
                          <span className="text-muted-foreground">{parseProgress}%</span>
                        </div>
                        <Progress value={parseProgress} className="h-2" />
                        {pendingFile && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {pendingFile.name} · {(pendingFile.size / 1024).toFixed(1)} KB
                          </div>
                        )}
                      </div>
                    )}
                    <FormatTester />
                  </CardContent>
                </Card>
              )}

              {step === 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" /> Map columns
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm">
                      File: <span className="font-medium">{fileName}</span> — {rawRows.length} rows,{" "}
                      {rawHeaders.length} columns detected.
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Map each canonical field to a column from your file. We pre-filled obvious
                      matches; review and adjust if your biometric export uses different headers.{" "}
                      <span className="text-destructive font-medium">Required</span> fields must be
                      set to continue.
                    </p>

                    <PresetBar
                      mapping={userHeaderMap}
                      fileHeaders={rawHeaders}
                      onApply={(m) => setUserHeaderMap(m)}
                      selectedPresetId={selectedPresetId}
                      onSelectPreset={setSelectedPresetId}
                    />

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.keys(HEADER_ALIASES).map((canonical) => {
                        const required = REQUIRED_HEADERS.includes(canonical);
                        const current = userHeaderMap[canonical] ?? "__none__";
                        const fieldIssues = mappingIssuesByField[canonical] ?? [];
                        const hasError = fieldIssues.some((i) => i.severity === "error");
                        const hasWarning = fieldIssues.some((i) => i.severity === "warning");
                        return (
                          <div key={canonical} className="space-y-1">
                            <label className="text-xs font-medium flex items-center gap-1">
                              {canonical}
                              {required && <span className="text-destructive">*</span>}
                            </label>
                            <Select
                              value={current}
                              onValueChange={(v) => {
                                setUserHeaderMap((prev) => {
                                  const next = { ...prev };
                                  if (v === "__none__") delete next[canonical];
                                  else next[canonical] = v;
                                  return next;
                                });
                              }}
                            >
                              <SelectTrigger
                                className={`h-9 text-xs ${hasError ? "border-destructive ring-1 ring-destructive/30" : hasWarning ? "border-amber-500/60 ring-1 ring-amber-500/20" : ""}`}
                              >
                                <SelectValue placeholder="— none —" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— none —</SelectItem>
                                {rawHeaders.map((h) => (
                                  <SelectItem key={h} value={h}>
                                    {h}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {fieldIssues.map((i, idx) => (
                              <div
                                key={idx}
                                className={`flex items-start gap-1 text-[11px] ${i.severity === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}
                              >
                                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                <span>{i.message}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>

                    {mappingHasErrors && (
                      <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Fix the issues above before continuing to preview.
                      </div>
                    )}

                    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground">
                        Sample (first row from your file)
                      </div>
                      <div className="text-xs grid gap-1 sm:grid-cols-2">
                        {rawHeaders.slice(0, 8).map((h) => (
                          <div key={h} className="truncate">
                            <span className="text-muted-foreground">{h}:</span>{" "}
                            <span className="font-mono">{String(rawRows[0]?.[h] ?? "—")}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={grading}
                        onClick={() => {
                          setStep(1);
                          setRawRows([]);
                          setRawHeaders([]);
                          setUserHeaderMap({});
                          setPendingFile(null);
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" /> Back
                      </Button>
                      <Button
                        disabled={grading || rawRows.length === 0 || mappingHasErrors}
                        title={
                          mappingHasErrors
                            ? mappingIssues
                                .filter((i) => i.severity === "error")
                                .map((i) => `${i.field}: ${i.message}`)
                                .join(" · ")
                            : undefined
                        }
                        onClick={() => {
                          setGrading(true);
                          setTimeout(() => {
                            setStep(3);
                            setGrading(false);
                          }, 50);
                        }}
                      >
                        {grading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Grading…
                          </>
                        ) : (
                          <>
                            Continue to Preview <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-8 gap-3">
                    <Stat label="Total" value={counts.total} />
                    <Stat label="Present" value={counts.present} tone="green" />
                    <Stat label="Half-Day" value={counts.half_day} tone="amber" />
                    <Stat label="Absent" value={counts.absent} tone="red" />
                    <Stat label="Late" value={counts.late} tone="amber" />
                    <Stat label="Early checkout" value={counts.early} tone="blue" />
                    <Stat label="Matched users" value={matchCounts.matched} tone="green" />
                    <Stat
                      label="Unmatched"
                      value={matchCounts.unmatched}
                      tone={matchCounts.unmatched ? "amber" : undefined}
                    />
                  </div>
                  {matchCounts.unmatched > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/40 flex flex-wrap items-center gap-2">
                      <span>
                        <strong>{matchCounts.unmatched}</strong> row
                        {matchCounts.unmatched === 1 ? "" : "s"} couldn't be linked to an employee
                        profile. Resolve them below, or tick the checkbox to skip them on commit.
                      </span>
                      <label className="ml-auto flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={skipUnmatched}
                          onChange={(e) => setSkipUnmatched(e.target.checked)}
                        />
                        Skip unmatched on commit
                      </label>
                    </div>
                  )}

                  <ValidationSummary
                    buckets={validationBuckets}
                    activeBucket={activeBucket}
                    onSelectBucket={setActiveBucket}
                    title="Validation rules triggered"
                  />

                  <MatchResolver
                    groups={unresolvedGroups}
                    profiles={profilesQ.data ?? []}
                    overrides={matchOverrides}
                    onChange={setMatchOverrides}
                  />

                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-wrap gap-2 items-center">
                        <Select
                          value={filterStatus}
                          onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All ({counts.total})</SelectItem>
                            <SelectItem value="present">Present ({counts.present})</SelectItem>
                            <SelectItem value="half_day">Half-Day ({counts.half_day})</SelectItem>
                            <SelectItem value="absent">Absent ({counts.absent})</SelectItem>
                            <SelectItem value="late">Late ({counts.late})</SelectItem>
                            <SelectItem value="early">Early checkout ({counts.early})</SelectItem>
                          </SelectContent>
                        </Select>
                        {activeBucket && (
                          <Badge variant="outline" className="border-primary/50 text-primary">
                            Bucket: {activeBucket.replace("_", " ")} ({filteredByBucket.length})
                            <button
                              type="button"
                              className="ml-1 text-muted-foreground hover:text-foreground"
                              onClick={() => setActiveBucket(null)}
                              aria-label="Clear bucket filter"
                            >
                              ×
                            </button>
                          </Badge>
                        )}
                        <div className="ml-auto flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={exportPreviewCsv}
                            title="Export preview"
                            aria-label="Export preview"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" onClick={() => setStep(2)}>
                            <ArrowLeft className="h-4 w-4" /> Back
                          </Button>
                          <Button
                            onClick={() => commit.mutate()}
                            disabled={commit.isPending || counts.total === 0}
                          >
                            {commit.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" /> Committing…
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4" /> Commit{" "}
                                {counts.total - counts.errors} rows to database
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {(commit.isPending || commitProgress.total > 0) && (
                        <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-2 font-medium">
                              {commit.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                              {commitProgress.stage || "Committing rows…"}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {commitProgress.done.toLocaleString()} /{" "}
                              {commitProgress.total.toLocaleString()} rows
                            </span>
                          </div>
                          <Progress
                            value={
                              commitProgress.total
                                ? Math.round((commitProgress.done / commitProgress.total) * 100)
                                : 0
                            }
                            className="h-2"
                          />
                          <div className="text-[11px] text-muted-foreground">
                            Inserting in batches of 500 — please don't close this tab.
                          </div>
                        </div>
                      )}

                      {(counts.errors > 0 || counts.warnings > 0) && (
                        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-2 dark:bg-amber-500/10 dark:border-amber-500/40">
                          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                            <AlertTriangle className="h-4 w-4" />
                            Validation report — {counts.errors} error
                            {counts.errors === 1 ? "" : "s"} (skipped) and {counts.warnings} warning
                            {counts.warnings === 1 ? "" : "s"}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-7"
                              onClick={exportErrorReport}
                            >
                              <Download className="h-3 w-3" /> Download report
                            </Button>
                          </div>
                          <div className="max-h-40 overflow-auto text-xs">
                            <table className="w-full">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th className="text-left p-1">Row</th>
                                  <th className="text-left p-1">Employee</th>
                                  <th className="text-left p-1">Date</th>
                                  <th className="text-left p-1">Severity</th>
                                  <th className="text-left p-1">Issue</th>
                                </tr>
                              </thead>
                              <tbody>
                                {issues.slice(0, 50).map((r) => (
                                  <tr key={r.rowIndex} className="border-t border-amber-200/50">
                                    <td className="p-1">{r.rowIndex + 2}</td>
                                    <td className="p-1">
                                      {r.employee_name || r.employee_code || "—"}
                                    </td>
                                    <td className="p-1">{r.entry_date || "—"}</td>
                                    <td className="p-1">
                                      {r.parse_error ? (
                                        <Badge variant="destructive" className="text-[10px]">
                                          error
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] border-amber-400 text-amber-700"
                                        >
                                          warning
                                        </Badge>
                                      )}
                                    </td>
                                    <td className="p-1">
                                      {[r.parse_error, ...r.warnings].filter(Boolean).join(" · ")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {issues.length > 50 && (
                              <div className="p-1 text-center text-muted-foreground">
                                …and {issues.length - 50} more — download the report for the full
                                list.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="overflow-auto border rounded-md max-h-[60vh]">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="text-left p-2">Employee</th>
                              <th className="text-left p-2">Date</th>
                              <th className="text-left p-2">In</th>
                              <th className="text-left p-2">Out</th>
                              <th className="text-left p-2">Hours</th>
                              <th className="text-left p-2">Status</th>
                              <th className="text-left p-2">Flags</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredByBucket.slice(0, 500).map((r) => (
                              <tr key={r.rowIndex} className="border-t">
                                <td className="p-2">
                                  <div className="font-medium">{r.employee_name || "—"}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {r.employee_code} {r.department ? `· ${r.department}` : ""}
                                  </div>
                                </td>
                                <td className="p-2">
                                  {r.entry_date}
                                  {r.day_of_week ? ` (${r.day_of_week.slice(0, 3)})` : ""}
                                </td>
                                <td className="p-2">
                                  {r.punch_in
                                    ? new Date(r.punch_in).toLocaleTimeString("en-IN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        timeZone: "Asia/Kolkata",
                                      })
                                    : "—"}
                                </td>
                                <td className="p-2">
                                  {r.punch_out
                                    ? new Date(r.punch_out).toLocaleTimeString("en-IN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        timeZone: "Asia/Kolkata",
                                      })
                                    : "—"}
                                </td>
                                <td className="p-2">
                                  {r.total_minutes_in_office
                                    ? fmtMins(r.total_minutes_in_office)
                                    : "—"}
                                </td>
                                <td className="p-2">
                                  <StatusBadge status={r.auto_status} />
                                </td>
                                <td className="p-2 space-x-1">
                                  {r.is_late_arrival && (
                                    <Badge
                                      variant="outline"
                                      className="border-amber-400 text-amber-800 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/40"
                                    >
                                      Late +{r.late_by_minutes}m
                                    </Badge>
                                  )}
                                  {r.is_early_checkout && (
                                    <Badge
                                      variant="outline"
                                      className="border-blue-400 text-blue-800 bg-blue-50 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/40"
                                    >
                                      Early -{r.early_by_minutes}m
                                    </Badge>
                                  )}
                                  {r.parse_error && (
                                    <Badge variant="destructive">Skip: {r.parse_error}</Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {filteredByBucket.length > 500 && (
                          <div className="p-2 text-xs text-muted-foreground text-center">
                            Showing first 500 of {filteredByBucket.length} rows. All matching rows
                            will be committed.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function PolicyBanner({ policy }: { policy: Policy }) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3 text-xs flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span className="font-medium">Active policy:</span>
        <span>
          Start {policy.standard_start_time} (+{policy.grace_period_minutes}m grace)
        </span>
        <span>
          End {policy.standard_end_time}
          {policy.early_checkout_grace_minutes
            ? ` (-${policy.early_checkout_grace_minutes}m grace)`
            : ""}
        </span>
        <span>Full Day ≥ {policy.min_hours_full_day}h</span>
        <span>Half Day ≥ {policy.min_hours_half_day}h</span>
        <Link to="/admin/settings" className="ml-auto underline text-primary">
          Edit policy
        </Link>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: GradedRow["auto_status"] }) {
  if (status === "present")
    return <Badge className="bg-green-600 hover:bg-green-600">Present</Badge>;
  if (status === "half_day")
    return <Badge className="bg-amber-500 hover:bg-amber-500">Half-Day</Badge>;
  return <Badge variant="destructive">Absent</Badge>;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "red" | "blue";
}) {
  const toneCls =
    tone === "green"
      ? "text-green-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "red"
          ? "text-red-700"
          : tone === "blue"
            ? "text-blue-700"
            : "";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Stepper({ step, busy }: { step: 1 | 2 | 3; busy?: boolean }) {
  const steps = ["Upload", "Map & validate", "Preview & commit"];
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = step === n;
        const done = step > n;
        return (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${active ? "bg-primary text-primary-foreground" : done ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}
            >
              {active && busy ? <Loader2 className="h-3 w-3 animate-spin" /> : done ? "✓" : n}
            </div>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{s}</span>
            {n < 3 && <span className="text-muted-foreground">→</span>}
          </div>
        );
      })}
    </div>
  );
}
