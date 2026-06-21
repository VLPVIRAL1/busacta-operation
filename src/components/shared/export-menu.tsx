import { useState } from "react";
import { Download, FileSpreadsheet, FileText, FileType2, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportRow, ExportMeta } from "@/lib/shared/export";
import type { PdfRowStyle, PdfSection } from "@/lib/shared/pdf-export";
import {
  resolveVariants,
  buildExportFilename,
  buildMultiSheetPayload,
  buildSharedMeta,
  isExportEmpty,
  type ExportVariant,
} from "./export-menu-helpers";

export type { ExportVariant } from "./export-menu-helpers";

// Lazy import the export helpers so xlsx/jspdf (~700KB combined) only load when
// the user actually clicks an export action, not on every page that mounts the menu.
const loadExport = () => import("@/lib/shared/export");

interface Props {
  filenameBase: string;
  rows: ExportRow[];
  variants?: ExportVariant[];
  meta?: ExportMeta & { metaChips?: Array<{ label: string; value: string }> };
  pdf?: {
    title: string;
    subtitle?: string;
    from?: string;
    to?: string;
    columns: string[];
    pdfRows: Array<Array<string | number>>;
    footer?: Array<string | number>;
    orientation?: "portrait" | "landscape";
    rowStyles?: Array<PdfRowStyle | undefined>;
    rowIndents?: number[];
    extraSections?: PdfSection[];
  };
  pdfCustom?: { label?: string; onClick: () => void | Promise<void> };
  disabled?: boolean;
  size?: "default" | "sm";
}

export function ExportMenu({
  filenameBase,
  rows,
  variants,
  meta,
  pdf,
  pdfCustom,
  disabled,
  size = "sm",
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const effectiveVariants = resolveVariants(variants, rows);
  const empty = disabled || isExportEmpty(effectiveVariants, Boolean(pdfCustom || pdf));
  const multi = effectiveVariants.length > 1;
  const sharedMeta = buildSharedMeta(meta, pdf);

  function run(key: string, label: string, fn: () => Promise<void> | void) {
    if (busy) return;
    setBusy(key);
    const promise = Promise.resolve().then(fn);
    toast.promise(promise, {
      loading: `Exporting ${label}…`,
      success: `${label} ready`,
      error: (err) => `${label} failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
    promise.catch(() => {}).finally(() => setBusy(null));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={size === "sm" ? "h-8 w-8" : "h-9 w-9"}
          disabled={empty || busy !== null}
          title="Export"
          aria-label="Export"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {effectiveVariants.map((v, i) => {
          const csvKey = `csv:${i}`;
          const xlsxKey = `xlsx:${i}`;
          return (
            <div key={`${v.label}-${i}`}>
              {multi && (
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {v.label}
                </DropdownMenuLabel>
              )}
              <DropdownMenuItem
                disabled={v.rows.length === 0 || busy !== null}
                onSelect={(e) => {
                  e.preventDefault();
                  run(csvKey, `${v.label} CSV`, async () => {
                    const { exportCSVRows } = await loadExport();
                    exportCSVRows(buildExportFilename(filenameBase, v.suffix, "csv"), v.rows);
                  });
                }}
              >
                {busy === csvKey ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={v.rows.length === 0 || busy !== null}
                onSelect={(e) => {
                  e.preventDefault();
                  run(xlsxKey, `${v.label} Excel`, async () => {
                    const { exportXLSX } = await loadExport();
                    exportXLSX(buildExportFilename(filenameBase, v.suffix, "xlsx"), v.rows, {
                      ...sharedMeta,
                      sheetName: v.sheetName ?? v.label,
                    });
                  });
                }}
              >
                {busy === xlsxKey ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                Excel (.xlsx)
              </DropdownMenuItem>
              {multi && i < effectiveVariants.length - 1 && <DropdownMenuSeparator />}
            </div>
          );
        })}
        {multi && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={busy !== null}
              onSelect={(e) => {
                e.preventDefault();
                run("xlsx:all", "Excel workbook", async () => {
                  const { exportXLSXMultiSheet } = await loadExport();
                  const payload = buildMultiSheetPayload(filenameBase, effectiveVariants);
                  exportXLSXMultiSheet(payload.filename, payload.sheets, sharedMeta);
                });
              }}
            >
              {busy === "xlsx:all" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Layers className="h-4 w-4 mr-2" />
              )}
              Excel — all sheets
            </DropdownMenuItem>
          </>
        )}
        {pdfCustom && (
          <>
            {multi && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={busy !== null}
              onSelect={(e) => {
                e.preventDefault();
                run("pdf:custom", pdfCustom.label ?? "PDF", async () => {
                  await pdfCustom.onClick();
                });
              }}
            >
              {busy === "pdf:custom" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileType2 className="h-4 w-4 mr-2" />
              )}
              {pdfCustom.label ?? "PDF"}
            </DropdownMenuItem>
          </>
        )}
        {pdf && !pdfCustom && (
          <>
            {multi && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={busy !== null}
              onSelect={(e) => {
                e.preventDefault();
                run("pdf:default", "PDF", async () => {
                  const { exportPDFTable } = await loadExport();
                  exportPDFTable({
                    title: pdf.title,
                    subtitle: pdf.subtitle,
                    from: pdf.from,
                    to: pdf.to,
                    scope: meta?.scope,
                    meta: meta?.metaChips,
                    columns: pdf.columns,
                    rows: pdf.pdfRows,
                    footer: pdf.footer,
                    extraSections: pdf.extraSections,
                    filename: buildExportFilename(filenameBase, "", "pdf"),
                    orientation: pdf.orientation,
                    rowStyles: pdf.rowStyles,
                    rowIndents: pdf.rowIndents,
                  });
                });
              }}
            >
              {busy === "pdf:default" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileType2 className="h-4 w-4 mr-2" />
              )}
              PDF
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
