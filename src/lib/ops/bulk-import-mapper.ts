/**
 * Shared parsing utilities for the Bulk Import Tasks feature.
 *
 * Owns the BulkRow type + all fuzzy parsers so that:
 *  - bulk-tasks-grid.tsx (TSV paste)
 *  - bulk-add.tsx (file upload via parseAttendanceFile)
 * …both use the same data shapes without circular imports.
 */
import type { ParsedFile } from "@/lib/hr/parse-attendance-file";

// ─── Core type ──────────────────────────────────────────────────────

export type BulkRow = {
  _key: string;
  /** User-visible task identifier (maps to tasks.display_id). */
  displayId: string;
  clientName: string;
  title: string;
  description: string;
  /** Typed by the user; resolved to a UUID in the route before calling the server fn. */
  assigneeName: string;
  reviewerName: string;
  status: "draft" | "in_progress" | "review" | "waiting_client" | "complete";
  priority: "low" | "medium" | "high";
  complexity: "a_hard" | "b_medium" | "c_easy";
  period: "Monthly" | "Quarterly" | "Yearly" | "Ad-hoc" | null;
  taxYear: number | null;
  /** YYYY-MM-DDTHH:MM or "" */
  dueDate: string;
  /** YYYY-MM-DDTHH:MM or "" */
  startDate: string;
  /** UUID from project_return_types, or label string awaiting resolution, or null. */
  returnTypeId: string | null;
};

// ─── Row helpers ─────────────────────────────────────────────────────

let _seq = 0;
export function makeKey(): string {
  return `bulk-${Date.now()}-${++_seq}`;
}

export type EmptyRowDefaults = {
  taxYear?: number | null;
  startDate?: string;
  dueDate?: string;
  clientName?: string;
};

export function emptyRow(defaults?: EmptyRowDefaults): BulkRow {
  return {
    _key: makeKey(),
    displayId: "",
    clientName: defaults?.clientName ?? "",
    title: "",
    description: "",
    assigneeName: "",
    reviewerName: "",
    status: "draft",
    priority: "medium",
    complexity: "b_medium",
    period: null,
    taxYear: defaults?.taxYear ?? null,
    dueDate: defaults?.dueDate ?? "",
    startDate: defaults?.startDate ?? "",
    returnTypeId: null,
  };
}

export function isRowValid(row: BulkRow): boolean {
  return row.clientName.trim().length > 0 && row.title.trim().length > 0;
}

export function buildProfileMap(
  profiles: { id: string; full_name?: string | null; email?: string | null }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of profiles) {
    if (p.full_name?.trim()) m.set(p.full_name.trim().toLowerCase(), p.id);
    if (p.email?.trim()) m.set(p.email.trim().toLowerCase(), p.id);
  }
  return m;
}

// ─── Fuzzy enum parsers ───────────────────────────────────────────────

export function parsePriority(raw: string): BulkRow["priority"] {
  const s = raw.trim().toLowerCase();
  if (s === "h" || s === "high") return "high";
  if (s === "l" || s === "low") return "low";
  return "medium";
}

export function parseComplexity(raw: string): BulkRow["complexity"] {
  const s = raw.trim().toLowerCase();
  if (s === "a" || s === "a_hard" || s.startsWith("hard")) return "a_hard";
  if (s === "c" || s === "c_easy" || s.startsWith("easy")) return "c_easy";
  return "b_medium";
}

export function parsePeriod(raw: string): BulkRow["period"] {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("month")) return "Monthly";
  if (s.startsWith("quarter") || s === "q") return "Quarterly";
  if (s.startsWith("year") || s.startsWith("annual")) return "Yearly";
  if (s.startsWith("ad") || s === "adhoc" || s === "ad-hoc") return "Ad-hoc";
  return null;
}

export function parseStatus(raw: string): BulkRow["status"] {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (s.includes("progress") || s === "inprogress") return "in_progress";
  if (s.includes("review") || s === "rfr" || s === "readyforreview") return "review";
  if (s.includes("waiting") || s === "wc" || s === "waitingclient") return "waiting_client";
  if (s.includes("complete") || s === "done" || s === "closed") return "complete";
  return "draft";
}

export function parseSoftware(raw: string): "lacerte" | "drake" | "cch_axcess" | "ultratax" | "proconnect" | "other" | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("lacerte")) return "lacerte";
  if (s.includes("drake")) return "drake";
  if (s.includes("cch")) return "cch_axcess";
  if (s.includes("ultra")) return "ultratax";
  if (s.includes("proconnect") || s.includes("pro connect")) return "proconnect";
  return "other";
}

/**
 * Parse common date formats → YYYY-MM-DD.
 * Accepts: Date objects (from xlsx), ISO strings, US M/D/YYYY, MM-DD-YYYY.
 */
export function parseDate(raw: unknown): string {
  // Date objects come from SheetJS when cellDates:true is set
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? "" : raw.toISOString().slice(0, 10);
  }
  const s = String(raw ?? "").trim();
  if (!s || s === "null" || s === "undefined") return "";

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const d = new Date(s + "T00:00:00");
    if (!isNaN(d.getTime())) return s;
  }

  // US: M/D/YYYY or MM-DD-YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const date = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    if (!isNaN(date.getTime())) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  return "";
}

/**
 * Parse a date/datetime string and append a default time if no time is present.
 * Returns "YYYY-MM-DDTHH:MM" suitable for datetime-local inputs, or "" if invalid.
 */
export function parseDatetime(raw: unknown, defaultTime = "09:00"): string {
  const s = String(raw ?? "").trim();
  if (!s || s === "null" || s === "undefined") return "";
  // Already a full datetime (YYYY-MM-DDTHH:MM...)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  // Date only → append default time
  const date = parseDate(s);
  if (!date) return "";
  return `${date}T${defaultTime}`;
}

export function parseTaxYear(raw: unknown): number | null {
  const n = parseInt(String(raw ?? "").trim(), 10);
  if (isNaN(n) || n < 1900 || n > 2100) return null;
  return n;
}

// ─── Header → field mapping ───────────────────────────────────────────

type RowField = keyof Omit<BulkRow, "_key">;

const HEADER_MAP: Record<string, RowField> = {
  "task id": "displayId",
  "task_id": "displayId",
  "display id": "displayId",
  "display_id": "displayId",
  "id": "displayId",
  "ref": "displayId",
  "reference": "displayId",
  client: "clientName",
  "client name": "clientName",
  entity: "clientName",
  "entity name": "clientName",
  title: "title",
  task: "title",
  "task title": "title",
  "task name": "title",
  description: "description",
  desc: "description",
  notes: "description",
  comment: "description",
  assignee: "assigneeName",
  "assigned to": "assigneeName",
  staff: "assigneeName",
  "assigned staff": "assigneeName",
  "team member": "assigneeName",
  reviewer: "reviewerName",
  "review by": "reviewerName",
  "reviewed by": "reviewerName",
  "reviewer name": "reviewerName",
  status: "status",
  priority: "priority",
  pri: "priority",
  complexity: "complexity",
  difficulty: "complexity",
  period: "period",
  frequency: "period",
  recurrence: "period",
  "tax year": "taxYear",
  "tax yr": "taxYear",
  year: "taxYear",
  ty: "taxYear",
  "due date": "dueDate",
  due: "dueDate",
  deadline: "dueDate",
  "start date": "startDate",
  start: "startDate",
  "task type": "returnTypeId",
  "return type": "returnTypeId",
  "task type id": "returnTypeId",
  type: "returnTypeId",
};

/** Positional column order when no headers are recognized. */
const POSITIONAL_ORDER: RowField[] = [
  "displayId",
  "clientName",
  "title",
  "description",
  "assigneeName",
  "priority",
  "dueDate",
  "taxYear",
  "period",
  "complexity",
  "returnTypeId",
  "status",
  "reviewerName",
  "startDate",
];

function applyField(row: BulkRow, field: RowField, rawVal: unknown): void {
  const s = String(rawVal ?? "");
  switch (field) {
    case "displayId":
      row.displayId = s.trim();
      break;
    case "clientName":
      row.clientName = s.trim();
      break;
    case "title":
      row.title = s.trim();
      break;
    case "description":
      row.description = s.trim();
      break;
    case "assigneeName":
      row.assigneeName = s.trim();
      break;
    case "reviewerName":
      row.reviewerName = s.trim();
      break;
    case "status":
      row.status = parseStatus(s);
      break;
    case "priority":
      row.priority = parsePriority(s);
      break;
    case "complexity":
      row.complexity = parseComplexity(s);
      break;
    case "period":
      row.period = parsePeriod(s);
      break;
    case "taxYear":
      row.taxYear = parseTaxYear(rawVal);
      break;
    case "dueDate":
      row.dueDate = parseDatetime(rawVal, "17:00");
      break;
    case "startDate":
      row.startDate = parseDatetime(rawVal, "09:00");
      break;
    case "returnTypeId":
      // Store raw label/code — resolved to UUID in the import handler
      row.returnTypeId = s.trim() || null;
      break;
  }
}

// ─── Column aliases for mapping dialog ───────────────────────────────

/** Maps each BulkRow field key to recognized header strings (for the column-mapping dialog). */
export const BULK_COLUMN_ALIASES: Record<string, string[]> = {
  displayId: ["task id", "task_id", "display id", "display_id", "id", "ref", "reference"],
  clientName: ["client", "client name", "entity", "entity name"],
  title: ["title", "task", "task title", "task name"],
  description: ["description", "desc", "notes", "comment"],
  assigneeName: ["assignee", "assigned to", "staff", "assigned staff", "team member"],
  reviewerName: ["reviewer", "review by", "reviewed by", "reviewer name"],
  status: ["status"],
  priority: ["priority", "pri"],
  complexity: ["complexity", "difficulty"],
  period: ["period", "frequency", "recurrence"],
  taxYear: ["tax year", "tax yr", "year", "ty"],
  dueDate: ["due date", "due", "deadline"],
  startDate: ["start date", "start"],
  returnTypeId: ["task type", "return type", "type", "task type id"],
};

/** Human-readable label for each BulkRow field key (for the column-mapping dialog). */
export const BULK_COLUMN_LABELS: Record<string, string> = {
  displayId: "Task ID",
  clientName: "Client",
  title: "Title",
  description: "Description",
  assigneeName: "Assignee",
  reviewerName: "Reviewer",
  status: "Status",
  priority: "Priority",
  complexity: "Complexity",
  period: "Period",
  taxYear: "Tax Year",
  dueDate: "Due Date",
  startDate: "Start Date",
  returnTypeId: "Task Type",
};

/** Required BulkRow field keys (for the column-mapping dialog). */
export const BULK_REQUIRED_FIELDS = new Set(["clientName", "title"]);

/**
 * Map raw parsed file rows to BulkRow[] using an explicit header → field mapping
 * supplied by the user via the column-mapping dialog.
 * `headerMap` is `{ fieldKey → rawHeaderName }`.
 */
export function mapRawRowsWithHeaderMap(
  parsed: ParsedFile,
  headerMap: Partial<Record<string, string>>,
): BulkRow[] {
  // Build inverse: rawHeaderName → fieldKey
  const inverse = new Map<string, string>();
  for (const [field, rawHeader] of Object.entries(headerMap)) {
    if (rawHeader) inverse.set(rawHeader, field);
  }

  return parsed.rows
    .filter((rawRow) => Object.values(rawRow).some((v) => v != null && String(v).trim() !== ""))
    .map((rawRow) => {
      const row = emptyRow();
      for (const [rawHeader, val] of Object.entries(rawRow)) {
        const field = inverse.get(rawHeader) as keyof Omit<BulkRow, "_key"> | undefined;
        if (field) applyField(row, field, val);
      }
      return row;
    })
    .filter((row) => row.clientName || row.title);
}

// ─── File → BulkRow ───────────────────────────────────────────────────

/** Map a parsed xlsx/csv file to BulkRow[]. */
export function mapFileRowsToBulkRows(parsed: ParsedFile): BulkRow[] {
  const fieldByColIndex: (RowField | null)[] = parsed.headers.map(
    (h) => HEADER_MAP[h.trim().toLowerCase()] ?? null,
  );
  const hasAnyHeader = fieldByColIndex.some((f) => f !== null);

  return parsed.rows
    .filter((rawRow) => Object.values(rawRow).some((v) => v != null && String(v).trim() !== ""))
    .map((rawRow) => {
      const row = emptyRow();
      const entries = Object.entries(rawRow);

      if (hasAnyHeader) {
        parsed.headers.forEach((_, i) => {
          const field = fieldByColIndex[i];
          if (field && i < entries.length) {
            applyField(row, field, entries[i][1]);
          }
        });
      } else {
        // Positional fallback
        const values = Object.values(rawRow);
        POSITIONAL_ORDER.forEach((field, i) => {
          if (i < values.length) applyField(row, field, values[i]);
        });
      }
      return row;
    })
    .filter((row) => row.clientName || row.title);
}

// ─── TSV paste → BulkRow ─────────────────────────────────────────────

function isHeaderRow(cols: string[]): boolean {
  return (cols[0]?.trim().toLowerCase() ?? "") in HEADER_MAP;
}

/** Parse a clipboard TSV string (Excel copy) into BulkRow[]. */
export function parsePastedText(text: string): BulkRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const firstCols = lines[0].split("\t");
  let fieldMap: (RowField | null)[] | null = null;
  let dataLines = lines;

  if (isHeaderRow(firstCols)) {
    fieldMap = firstCols.map((c) => HEADER_MAP[c.trim().toLowerCase()] ?? null);
    dataLines = lines.slice(1);
  }

  return dataLines
    .map((line) => {
      const cols = line.split("\t");
      const row = emptyRow();
      if (fieldMap) {
        fieldMap.forEach((field, i) => {
          if (field && i < cols.length) applyField(row, field, cols[i]);
        });
      } else {
        POSITIONAL_ORDER.forEach((field, i) => {
          if (i < cols.length) applyField(row, field, cols[i]);
        });
      }
      return row;
    })
    .filter((row) => row.clientName || row.title);
}
