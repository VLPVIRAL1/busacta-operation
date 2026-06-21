import type { ExportRow, ExportMeta } from "@/lib/shared/export";

export interface ExportVariant {
  label: string;
  suffix: string;
  rows: ExportRow[];
  sheetName?: string;
}

export type ExportFormat = "csv" | "xlsx" | "pdf";

/** Resolve variants array, falling back to a single CSV variant wrapping `rows`. */
export function resolveVariants(
  variants: ExportVariant[] | undefined,
  fallbackRows: ExportRow[],
): ExportVariant[] {
  return variants && variants.length > 0
    ? variants
    : [{ label: "CSV", suffix: "", rows: fallbackRows }];
}

/** Compose the final filename. Suffix is appended before the extension. */
export function buildExportFilename(base: string, suffix: string, ext: ExportFormat): string {
  return `${base}${suffix}.${ext}`;
}

/** Excel sheet names must be ≤31 chars. */
export function normalizeSheetName(v: ExportVariant): string {
  return (v.sheetName ?? v.label).slice(0, 31);
}

/** Build the multi-sheet workbook payload from a list of variants. */
export function buildMultiSheetPayload(
  filenameBase: string,
  variants: ExportVariant[],
): {
  filename: string;
  sheets: Array<{ name: string; rows: ExportRow[] }>;
} {
  return {
    filename: `${filenameBase}.xlsx`,
    sheets: variants.map((v) => ({ name: normalizeSheetName(v), rows: v.rows })),
  };
}

/** Merge user-provided meta with PDF defaults for the shared header. */
export function buildSharedMeta(
  meta: (ExportMeta & { metaChips?: Array<{ label: string; value: string }> }) | undefined,
  pdf: { title?: string; subtitle?: string; from?: string; to?: string } | undefined,
): ExportMeta | undefined {
  if (!meta && !pdf) return undefined;
  return {
    title: meta?.title ?? pdf?.title,
    subtitle: meta?.subtitle ?? pdf?.subtitle,
    period:
      meta?.period ??
      (pdf?.from || pdf?.to ? `${pdf?.from ?? "—"} → ${pdf?.to ?? "—"}` : undefined),
    scope: meta?.scope,
  };
}

/** True when there's nothing exportable across variants and no custom PDF. */
export function isExportEmpty(variants: ExportVariant[], hasPdf: boolean): boolean {
  return variants.every((v) => v.rows.length === 0) && !hasPdf;
}
