import * as XLSX from "xlsx";
import { exportReportPdf, type PdfSection, type PdfRowStyle } from "@/lib/shared/pdf-export";
import { downloadCSV, toCSV } from "@/lib/format/csv";

export type ExportRow = Record<string, string | number | null | undefined>;

export interface ExportMeta {
  title?: string;
  subtitle?: string;
  period?: string;
  scope?: string;
  /** Worksheet name (defaults to "Sheet1"). Truncated to 31 chars. */
  sheetName?: string;
}

/** INR-style number format, with negatives in parens and zero shown as em-dash. */
const INR_FMT = '_-#,##0.00_-;[Red](#,##0.00);"—"_-;_-@_-';

function autoColWidths(rows: ExportRow[], headers: string[]): Array<{ wch: number }> {
  return headers.map((h) => {
    let maxLen = h.length;
    for (const r of rows) {
      const v = r[h];
      const s = v == null ? "" : String(v);
      if (s.length > maxLen) maxLen = s.length;
    }
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
  });
}

/** Build a styled worksheet with branded header rows above the data table. */
function buildSheet(
  rows: ExportRow[],
  meta: ExportMeta | undefined,
): {
  ws: XLSX.WorkSheet;
  headerRow: number;
} {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const aoa: Array<Array<string | number | null>> = [];
  let headerRow = 1;

  if (meta) {
    if (meta.title) aoa.push([meta.title]);
    if (meta.subtitle) aoa.push([meta.subtitle]);
    if (meta.period || meta.scope) {
      const parts: string[] = [];
      if (meta.period) parts.push(`Period: ${meta.period}`);
      if (meta.scope) parts.push(`Scope: ${meta.scope}`);
      aoa.push([parts.join("   |   ")]);
    }
    aoa.push([`Generated: ${new Date().toLocaleString()}`]);
    aoa.push([]); // blank spacer
    headerRow = aoa.length + 1;
  }

  // Column headers
  aoa.push(headers);
  // Data rows
  for (const r of rows) {
    aoa.push(
      headers.map((h) => {
        const v = r[h];
        if (v === null || v === undefined) return "";
        return v;
      }),
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Number formats on data cells (skip header rows + column header row)
  const dataStart = headerRow; // zero-indexed row of column headers
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const cell = XLSX.utils.encode_cell({ r: dataStart + r, c });
      const ref = ws[cell];
      if (ref && typeof ref.v === "number") {
        ref.t = "n";
        ref.z = INR_FMT;
      }
    }
  }

  // Column widths
  ws["!cols"] = autoColWidths(rows, headers);

  // Merge title/subtitle/period rows across all columns for a clean header look.
  if (meta && headers.length > 1) {
    const merges: XLSX.Range[] = [];
    const lastCol = headers.length - 1;
    let metaRowIdx = 0;
    const metaCount =
      (meta.title ? 1 : 0) + (meta.subtitle ? 1 : 0) + (meta.period || meta.scope ? 1 : 0) + 1;
    for (let i = 0; i < metaCount; i++) {
      merges.push({ s: { r: metaRowIdx, c: 0 }, e: { r: metaRowIdx, c: lastCol } });
      metaRowIdx++;
    }
    ws["!merges"] = merges;
  }

  // Freeze the column-header row so it stays visible when scrolling.
  ws["!freeze"] = { xSplit: 0, ySplit: headerRow };

  return { ws, headerRow };
}

export function exportXLSX(filename: string, rows: ExportRow[], metaOrSheet?: ExportMeta | string) {
  const meta: ExportMeta | undefined =
    typeof metaOrSheet === "string" ? { sheetName: metaOrSheet } : metaOrSheet;
  const sheetName = (meta?.sheetName ?? "Sheet1").slice(0, 31);
  const { ws } = buildSheet(rows, meta);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/** Write multiple variants as separate sheets in a single workbook. */
export function exportXLSXMultiSheet(
  filename: string,
  sheets: Array<{ name: string; rows: ExportRow[] }>,
  meta?: Omit<ExportMeta, "sheetName">,
) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const { ws } = buildSheet(s.rows, meta);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function exportPDFTable(opts: {
  title: string;
  subtitle?: string;
  from?: string;
  to?: string;
  scope?: string;
  meta?: Array<{ label: string; value: string }>;
  columns: string[];
  rows: Array<Array<string | number>>;
  footer?: Array<string | number>;
  /** Additional sections rendered after the main table. */
  extraSections?: PdfSection[];
  filename: string;
  orientation?: "portrait" | "landscape";
  rowStyles?: Array<PdfRowStyle | undefined>;
  rowIndents?: number[];
}) {
  const section: PdfSection = {
    columns: opts.columns,
    rows: opts.rows,
    footer: opts.footer,
    rowStyles: opts.rowStyles as PdfRowStyle[] | undefined,
    rowIndents: opts.rowIndents,
  };
  exportReportPdf({
    title: opts.title,
    subtitle: opts.subtitle,
    from: opts.from,
    to: opts.to,
    scope: opts.scope,
    meta: opts.meta,
    sections: [section, ...(opts.extraSections ?? [])],
    filename: opts.filename,
    orientation: opts.orientation ?? "landscape",
  });
}

export function exportCSVRows(filename: string, rows: ExportRow[], headers?: string[]) {
  downloadCSV(filename, toCSV(rows as Array<Record<string, unknown>>, headers));
}
