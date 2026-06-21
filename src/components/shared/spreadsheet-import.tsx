/**
 * SpreadsheetImport — a reusable, Excel-style paste grid for bulk data import.
 *
 * The single import experience used across the app wherever data is brought in
 * from a spreadsheet. Users can:
 *   - Click any cell and paste (Ctrl+V) tab-separated data straight from Excel.
 *   - Double-click (or start typing) to edit a cell; Enter/Tab to commit.
 *   - Press Delete/Backspace to clear the selected cell.
 *   - Navigate with the arrow keys, like a spreadsheet.
 *   - Optionally upload a .csv/.xlsx file and download a starter template.
 *
 * It is generic over the row shape `T`. Callers describe their columns and
 * supply `emptyRow`, `validateRow`, and `onImport`. Post-import result UI
 * (success counts, failure tables, retries) belongs to the caller — this
 * component owns only the Paste → Validate → Import grid flow.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Download, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";

// ── Public types ──────────────────────────────────────────────────────

export type ImportColumnType = "text" | "number" | "date" | "datetime-local" | "select";

export interface ImportColumn<T> {
  /** Property on the row this column reads/writes. */
  key: keyof T & string;
  /** Header label. */
  label: string;
  /** Marks the column header with a red asterisk and is used by callers' validation. */
  required?: boolean;
  /** Cell editor type. Defaults to "text". */
  type?: ImportColumnType;
  /** Options for `type: "select"`. `color` is a Tailwind bg class (e.g. "bg-blue-500") shown as a dot. `note` is secondary text. */
  options?: { value: string; label: string; color?: string; note?: string }[];
  /** Minimum column width in px. */
  width?: number;
  /** Placeholder shown in the editor. */
  placeholder?: string;
  /** Coerce a raw pasted/typed string into the stored value (default: trimmed string). */
  parse?: (raw: string) => T[keyof T];
  /** Render the stored value to a display string (default: String(value)). */
  format?: (value: T[keyof T]) => string;
}

export interface SpreadsheetImportProps<T extends Record<string, unknown>> {
  columns: ImportColumn<T>[];
  /** Create a blank row. */
  emptyRow: () => T;
  /** Return a list of human-readable errors for a row (empty array = valid). */
  validateRow: (row: T) => string[];
  /** Invoked with only the valid rows when the user clicks Import. */
  onImport: (validRows: T[]) => Promise<void> | void;
  /** Enables the "Template" button. */
  onDownloadTemplate?: () => void;
  /** Enables the "Upload" button; parse the file into rows. */
  onParseFile?: (file: File) => Promise<T[]>;
  /** Rows to seed the grid with (e.g. when retrying failed rows). */
  initialRows?: T[];
  /** Label for the import button, given the valid-row count. */
  importLabel?: (count: number) => string;
  /** Disable all editing/actions (e.g. while a parent mutation runs). */
  busy?: boolean;
  /** Number of blank rows to show on first mount. Defaults to 12. */
  initialBlankRows?: number;
  /** Hint text shown under the grid heading. */
  hint?: ReactNode;
  /** Called whenever the grid rows change — use for draft persistence. */
  onRowsChange?: (rows: T[]) => void;
  /** Make the component grow to fill its flex-column parent instead of capping at 55vh.
   *  The parent must be a flex column with a defined height. */
  fill?: boolean;
}

type Cell = { r: number; c: number };

// ── Helpers ───────────────────────────────────────────────────────────

const DEFAULT_BLANK_ROWS = 12;

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Split a clipboard string copied from Excel into a 2-D matrix of cells. */
function parseClipboardMatrix(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t"));
}

// ── Component ─────────────────────────────────────────────────────────

export function SpreadsheetImport<T extends Record<string, unknown>>({
  columns,
  emptyRow,
  validateRow,
  onImport,
  onDownloadTemplate,
  onParseFile,
  initialRows,
  importLabel,
  busy = false,
  initialBlankRows = DEFAULT_BLANK_ROWS,
  hint,
  onRowsChange,
  fill = false,
}: SpreadsheetImportProps<T>) {
  const [rows, setRows] = useState<T[]>(() =>
    initialRows && initialRows.length > 0
      ? initialRows
      : Array.from({ length: initialBlankRows }, emptyRow),
  );
  const [selected, setSelected] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<Cell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const uploadInputId = useId();
  // A pristine row, used to tell whether a row has real content vs. just defaults.
  const blankRef = useRef<T | null>(null);
  if (blankRef.current === null) blankRef.current = emptyRow();

  // Reset grid when the caller swaps in a new initial set (e.g. retry).
  useEffect(() => {
    if (initialRows) {
      setRows(
        initialRows.length > 0 ? initialRows : Array.from({ length: initialBlankRows }, emptyRow),
      );
      setShowValidation(false);
      setSelected(null);
      setEditing(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRows]);

  useEffect(() => {
    onRowsChange?.(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const disabled = busy || importing || isParsing;

  // ── Derived ───────────────────────────────────────────────────────

  /** A row counts as "filled" only when some cell differs from a pristine blank
   *  row — so pre-filled defaults (e.g. a default select value) don't make an
   *  otherwise-empty row look like data. */
  const isRowFilled = useCallback(
    (row: T) =>
      columns.some((col) => {
        const v = row[col.key];
        if (v == null || String(v).trim() === "") return false;
        const blank = blankRef.current?.[col.key];
        return String(v) !== String(blank ?? "");
      }),
    [columns],
  );

  const { filled, valid, invalid } = useMemo(() => {
    const filledRows = rows.filter(isRowFilled);
    const validRows = filledRows.filter((r) => validateRow(r).length === 0);
    return {
      filled: filledRows.length,
      valid: validRows.length,
      invalid: filledRows.length - validRows.length,
    };
  }, [rows, isRowFilled, validateRow]);

  const phase: "paste" | "validate" | "import" =
    showValidation && valid > 0 ? "import" : filled > 0 ? "validate" : "paste";

  // ── Cell mutation ──────────────────────────────────────────────────

  const writeCell = useCallback(
    (r: number, c: number, raw: string) => {
      const col = columns[c];
      const value = col.parse ? col.parse(raw) : (raw.trim() as T[keyof T]);
      setRows((prev) => {
        const next = prev.length > r ? [...prev] : growTo(prev, r + 1, emptyRow);
        next[r] = { ...next[r], [col.key]: value };
        return next;
      });
    },
    [columns, emptyRow],
  );

  const clearCell = useCallback(
    (r: number, c: number) => {
      const col = columns[c];
      setRows((prev) => {
        if (r >= prev.length) return prev;
        const next = [...prev];
        next[r] = { ...next[r], [col.key]: emptyRow()[col.key] };
        return next;
      });
    },
    [columns, emptyRow],
  );

  // ── Paste ──────────────────────────────────────────────────────────

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      const text = e.clipboardData.getData("text/plain");
      if (!text.trim()) return;
      // Let single-value pastes flow into an open editor naturally.
      const isMatrix = text.includes("\t") || /\r?\n/.test(text.trim());
      if (editing && !isMatrix) return;

      e.preventDefault();
      let matrix = parseClipboardMatrix(text);
      if (matrix.length === 0) return;

      // Header detection: if the first pasted row's cells map to column labels,
      // align by name and drop that row. Otherwise paste positionally from the
      // selected cell.
      const headerMap = detectHeaderMap(matrix[0], columns);
      let startCol = selected?.c ?? 0;
      let startRow = selected?.r ?? 0;
      let colForMatrixIndex: number[];

      if (headerMap) {
        matrix = matrix.slice(1);
        colForMatrixIndex = headerMap;
        startCol = 0;
        if (!selected) startRow = 0;
      } else {
        colForMatrixIndex = matrix[0].map((_, i) => startCol + i);
      }

      setRows((prev) => {
        let next = [...prev];
        const neededRows = startRow + matrix.length;
        if (next.length < neededRows) next = growTo(next, neededRows, emptyRow);
        matrix.forEach((line, ri) => {
          const targetRow = startRow + ri;
          line.forEach((rawVal, ci) => {
            const c = colForMatrixIndex[ci];
            if (c == null || c < 0 || c >= columns.length) return;
            const col = columns[c];
            const value = col.parse ? col.parse(rawVal) : (rawVal.trim() as T[keyof T]);
            next[targetRow] = { ...next[targetRow], [col.key]: value };
          });
        });
        return next;
      });
      setShowValidation(false);
    },
    [disabled, editing, selected, columns, emptyRow],
  );

  // ── Keyboard ───────────────────────────────────────────────────────

  const commitEdit = useCallback(() => {
    if (!editing) return;
    writeCell(editing.r, editing.c, editValue);
    setEditing(null);
  }, [editing, editValue, writeCell]);

  const beginEdit = useCallback(
    (cell: Cell, seed?: string) => {
      if (disabled) return;
      const col = columns[cell.c];
      const current = rows[cell.r]?.[col.key];
      const display =
        seed !== undefined
          ? seed
          : current == null
            ? ""
            : col.format
              ? col.format(current)
              : String(current);
      setEditValue(display);
      setEditing(cell);
    },
    [columns, rows, disabled],
  );

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled || !selected || editing) return;
      const { r, c } = selected;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelected({ r: Math.max(0, r - 1), c });
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelected({ r: Math.min(rows.length - 1, r + 1), c });
          break;
        case "ArrowLeft":
          e.preventDefault();
          setSelected({ r, c: Math.max(0, c - 1) });
          break;
        case "ArrowRight":
        case "Tab":
          e.preventDefault();
          setSelected({ r, c: Math.min(columns.length - 1, c + 1) });
          break;
        case "Enter":
        case "F2":
          e.preventDefault();
          beginEdit(selected);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          clearCell(r, c);
          break;
        default:
          // Start typing → enter edit mode seeded with the first char (text/number only).
          if (
            e.key.length === 1 &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            columns[c].type !== "select" &&
            columns[c].type !== "date" &&
            columns[c].type !== "datetime-local"
          ) {
            beginEdit(selected, e.key);
          }
      }
    },
    [disabled, selected, editing, rows.length, columns, beginEdit, clearCell],
  );

  // ── Actions ────────────────────────────────────────────────────────

  const addRows = useCallback(
    (count = 5) => {
      setRows((prev) => [...prev, ...Array.from({ length: count }, emptyRow)]);
    },
    [emptyRow],
  );

  const clearAll = useCallback(() => {
    setRows(Array.from({ length: initialBlankRows }, emptyRow));
    setSelected(null);
    setEditing(null);
    setShowValidation(false);
  }, [emptyRow, initialBlankRows]);

  const runImport = useCallback(async () => {
    setShowValidation(true);
    const validRows = rows.filter(isRowFilled).filter((r) => validateRow(r).length === 0);
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      await onImport(validRows);
    } finally {
      setImporting(false);
    }
  }, [rows, isRowFilled, validateRow, onImport]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!onParseFile) return;
      setIsParsing(true);
      try {
        const parsed = await onParseFile(file);
        if (parsed.length === 0) return;
        setRows((prev) => {
          const existing = prev.filter(isRowFilled);
          return [...existing, ...parsed];
        });
        setShowValidation(false);
      } finally {
        setIsParsing(false);
      }
    },
    [onParseFile, isRowFilled],
  );

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className={fill ? "flex flex-col flex-1 min-h-0 gap-2" : "space-y-3"}>
      <Stepper phase={phase} />

      <Card className={fill ? "flex flex-col flex-1 min-h-0" : ""}>
        <CardContent className={cn("p-4", fill ? "flex flex-col flex-1 min-h-0 gap-3" : "space-y-3")}>
          {/* Toolbar */}
          <div className="shrink-0 flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">Paste or enter data</h3>
              <p className="text-xs text-muted-foreground">
                Click any cell and paste (Ctrl+V) directly from Excel. Double-click to edit a cell.
                Delete key clears the selection.
              </p>
              {hint && <div className="text-xs text-muted-foreground pt-0.5">{hint}</div>}
            </div>
            <div className="flex items-center gap-2">
              {onParseFile && (
                <>
                  <input
                    id={uploadInputId}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = "";
                    }}
                  />
                  <Button asChild variant="outline" size="sm" disabled={disabled}>
                    <label
                      htmlFor={uploadInputId}
                      className={cn(disabled ? "cursor-not-allowed" : "cursor-pointer")}
                    >
                      {isParsing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Upload
                    </label>
                  </Button>
                </>
              )}
              {onDownloadTemplate && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={onDownloadTemplate}
                >
                  <Download className="h-4 w-4" /> Template
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={clearAll}
              >
                <Trash2 className="h-4 w-4" /> Clear
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => addRows()}
              >
                <Plus className="h-4 w-4" /> Add rows
              </Button>
            </div>
          </div>

          {/* Grid */}
          <div
            ref={gridRef}
            tabIndex={0}
            onPaste={handlePaste}
            onKeyDown={handleGridKeyDown}
            className={cn(
              "relative overflow-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              fill ? "flex-1 min-h-0" : "max-h-[55vh]",
            )}
          >
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="w-10 border-b border-r px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="border-b border-r px-3 py-2 text-left text-[11px] font-medium"
                      style={{ minWidth: col.width ?? 140 }}
                    >
                      {col.label}
                      {col.required && <span className="ml-0.5 text-destructive">*</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, r) => {
                  const errors = showValidation && isRowFilled(row) ? validateRow(row) : [];
                  const rowInvalid = errors.length > 0;
                  return (
                    <tr key={r} className={cn(rowInvalid && "bg-destructive/5")}>
                      <td className="w-10 border-b border-r bg-muted/30 px-2 py-1 text-center tabular-nums text-muted-foreground">
                        {r + 1}
                      </td>
                      {columns.map((col, c) => {
                        const isEditing = editing?.r === r && editing?.c === c;
                        const isSelected = selected?.r === r && selected?.c === c;
                        const value = row[col.key];
                        const display =
                          value == null || String(value) === ""
                            ? ""
                            : col.format
                              ? col.format(value)
                              : String(value);
                        const cellInvalid =
                          showValidation &&
                          col.required &&
                          isRowFilled(row) &&
                          (value == null || String(value).trim() === "");
                        return (
                          <td
                            key={col.key}
                            onClick={() => {
                              if (disabled) return;
                              setSelected({ r, c });
                              // Select columns open on single click — no double-click needed.
                              if (col.type === "select") beginEdit({ r, c });
                            }}
                            onDoubleClick={() => {
                              if (col.type !== "select") beginEdit({ r, c });
                            }}
                            className={cn(
                              "border-b border-r px-0 py-0 align-middle",
                              isSelected && !isEditing && "ring-2 ring-inset ring-primary",
                              cellInvalid && "bg-destructive/10",
                            )}
                          >
                            {isEditing ? (
                              <CellEditor
                                col={col}
                                value={editValue}
                                onChange={setEditValue}
                                onCommit={commitEdit}
                                onCommitWith={(v) => {
                                  writeCell(r, c, v);
                                  setEditing(null);
                                }}
                                onCancel={() => setEditing(null)}
                                onCommitAndMove={() => {
                                  commitEdit();
                                  setSelected({
                                    r: Math.min(rows.length - 1, r + 1),
                                    c,
                                  });
                                }}
                              />
                            ) : (
                              <div className="h-8 truncate px-3 leading-8">{display}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs">
              {filled === 0 ? (
                <span className="text-muted-foreground">No data to import</span>
              ) : (
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{filled}</span> filled ·{" "}
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {valid} valid
                  </span>
                  {invalid > 0 && (
                    <>
                      {" · "}
                      <span className="font-medium text-destructive">{invalid} need attention</span>
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || filled === 0}
                onClick={() => setShowValidation(true)}
              >
                Validate
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={disabled || valid === 0}
                onClick={runImport}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    {importLabel
                      ? importLabel(valid)
                      : `Import ${valid} row${valid === 1 ? "" : "s"}`}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Validation summary */}
          {showValidation && invalid > 0 && (
            <ValidationSummary
              rows={rows}
              columns={columns}
              validateRow={validateRow}
              isRowFilled={isRowFilled}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function Stepper({ phase }: { phase: "paste" | "validate" | "import" }) {
  const steps = [
    { id: "paste", label: "1. Paste data" },
    { id: "validate", label: "2. Validate" },
    { id: "import", label: "3. Import" },
  ] as const;
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1 font-medium",
              phase === s.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

function CellEditor<T extends Record<string, unknown>>({
  col,
  value,
  onChange,
  onCommit,
  onCommitWith,
  onCancel,
  onCommitAndMove,
}: {
  col: ImportColumn<T>;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  /** Commit a specific value directly — avoids stale-closure issues with selects. */
  onCommitWith: (v: string) => void;
  onCancel: () => void;
  onCommitAndMove: () => void;
}) {
  if (col.type === "select" && col.options) {
    // Track whether the user picked a value so onOpenChange knows whether to cancel.
    let committed = false;
    return (
      <Select
        defaultOpen
        value={value || undefined}
        onValueChange={(v) => {
          committed = true;
          onChange(v);
          onCommitWith(v);
        }}
        onOpenChange={(open) => {
          if (!open && !committed) onCancel();
        }}
      >
        <SelectTrigger className="h-8 rounded-none border-0 text-xs focus:ring-0">
          <SelectValue placeholder={col.placeholder ?? "Select"} />
        </SelectTrigger>
        <SelectContent>
          {col.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex items-center gap-1.5">
                {o.color && (
                  <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", o.color)} />
                )}
                <span>{o.label}</span>
                {o.note && (
                  <span className="ml-1 text-[10px] text-muted-foreground">{o.note}</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      autoFocus
      type={col.type === "number" ? "number" : col.type === "date" ? "date" : col.type === "datetime-local" ? "datetime-local" : "text"}
      value={value}
      placeholder={col.placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommitAndMove();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        } else if (e.key === "Tab") {
          onCommit();
        }
      }}
      className="h-8 rounded-none border-0 text-xs shadow-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    />
  );
}

function ValidationSummary<T extends Record<string, unknown>>({
  rows,
  columns,
  validateRow,
  isRowFilled,
}: {
  rows: T[];
  columns: ImportColumn<T>[];
  validateRow: (row: T) => string[];
  isRowFilled: (row: T) => boolean;
}) {
  const issues = rows
    .map((row, i) => ({ row: i + 1, errors: isRowFilled(row) ? validateRow(row) : [] }))
    .filter((x) => x.errors.length > 0);
  void columns;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <p className="mb-2 text-xs font-medium text-destructive">
        {issues.length} row{issues.length === 1 ? "" : "s"} need attention before import
      </p>
      <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
        {issues.map((x) => (
          <li key={x.row}>
            <span className="font-medium tabular-nums text-foreground">Row {x.row}:</span>{" "}
            {x.errors.join("; ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Internal helpers ───────────────────────────────────────────────────

function growTo<T>(arr: T[], length: number, make: () => T): T[] {
  if (arr.length >= length) return arr;
  return [...arr, ...Array.from({ length: length - arr.length }, make)];
}

/**
 * If `firstLine` looks like a header row whose cells match known column labels
 * or keys, return an array mapping each pasted column index → grid column index
 * (-1 for unrecognized). Returns null when it isn't a header row.
 */
function detectHeaderMap<T>(firstLine: string[], columns: ImportColumn<T>[]): number[] | null {
  const byLabel = new Map<string, number>();
  columns.forEach((col, i) => {
    byLabel.set(normalize(col.label), i);
    byLabel.set(normalize(col.key), i);
  });
  const mapped = firstLine.map((cell) => byLabel.get(normalize(cell)) ?? -1);
  const matches = mapped.filter((m) => m >= 0).length;
  // Treat as a header only when most cells resolve to columns.
  return matches >= Math.ceil(firstLine.length / 2) && matches >= 1 ? mapped : null;
}
