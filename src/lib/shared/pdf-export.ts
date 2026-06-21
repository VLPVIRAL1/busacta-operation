import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo.png";

export type PdfRowStyle = "normal" | "group" | "subtotal" | "total" | "muted";

export interface PdfSection {
  heading?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  /** Optional per-row style. Same length as rows. */
  rowStyles?: PdfRowStyle[];
  /** Per-row indent level (0..n) — adds left padding to the first column. */
  rowIndents?: number[];
  footer?: Array<string | number>;
}

export interface ReportPdfOptions {
  title: string;
  subtitle?: string;
  from?: string;
  to?: string;
  /** Optional scope label rendered as a chip under the title (e.g. account name, "All Petty Cash"). */
  scope?: string;
  /** Optional key/value chips rendered under the scope (Filters, Compare period, etc.). */
  meta?: Array<{ label: string; value: string }>;
  sections: PdfSection[];
  filename: string;
  orientation?: "portrait" | "landscape";
  /** Footer wordmark (defaults to BusAcTa Operations). */
  footerLabel?: string;
}

// Brand palette mirrors the invoice PDF.
const RPT_NAVY_DEEP: [number, number, number] = [13, 27, 60];
const RPT_GOLD: [number, number, number] = [201, 168, 76];
const RPT_BORDER: [number, number, number] = [226, 232, 240];
const RPT_MUTED: [number, number, number] = [100, 116, 139];
const PDF_GROUP_FILL: [number, number, number] = [226, 232, 240];
const PDF_SUBTOTAL_FILL: [number, number, number] = [241, 245, 249];
const PDF_TOTAL_FILL: [number, number, number] = [203, 213, 225];
const PDF_STRIPE: [number, number, number] = [248, 250, 252];

function fmtCell(c: string | number): string {
  if (typeof c === "number") {
    if (c < 0) return `(${Math.abs(c).toLocaleString("en-IN", { maximumFractionDigits: 2 })})`;
    return c === 0 ? "—" : c.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  return safe(String(c));
}

/** Strip characters outside jsPDF's default WinAnsi font, and normalise unicode dashes/arrows. */
function safe(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/[\u2192\u2794\u279C\u27A1]/g, " to ") // arrows → "to"
    .replace(/[\u2013\u2014]/g, "-") // en/em-dash
    .replace(/[\u2018\u2019]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // smart double quotes
    .replace(/\u00B7/g, "·") // keep middle-dot (WinAnsi has it)
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, ""); // strip out-of-range chars
}

/** Modern white header: title + badge row + right-aligned timestamp. No navy band. */
function drawReportHeader(doc: jsPDF, opts: ReportPdfOptions, logoDataUrl: string | null): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 36;

  // Logo or wordmark (left)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 32, y - 4, 96, 30);
    } catch {
      /* ignore */
    }
  } else {
    doc.setTextColor(RPT_NAVY_DEEP[0], RPT_NAVY_DEEP[1], RPT_NAVY_DEEP[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(safe("BusAcTa Operations"), 32, y + 12);
  }

  // Generated timestamp right-aligned
  doc.setTextColor(RPT_MUTED[0], RPT_MUTED[1], RPT_MUTED[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(safe(`Generated: ${new Date().toLocaleString()}`), pageWidth - 32, y + 6, {
    align: "right",
  });
  doc.text(safe(opts.footerLabel ?? "BusAcTa Operations · Reports"), pageWidth - 32, y + 18, {
    align: "right",
  });

  // Title
  y += 44;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(safe(opts.title), 32, y);
  y += 14;

  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(RPT_MUTED[0], RPT_MUTED[1], RPT_MUTED[2]);
    doc.text(safe(opts.subtitle), 32, y);
    y += 14;
  }

  // Badge row: Period + Scope + meta chips, all rendered as muted pills
  const chips: Array<{ label: string; value: string }> = [];
  if (opts.from || opts.to)
    chips.push({ label: "Period", value: `${opts.from ?? "—"} to ${opts.to ?? "—"}` });
  if (opts.scope) chips.push({ label: "Scope", value: opts.scope });
  if (opts.meta) chips.push(...opts.meta);

  if (chips.length > 0) {
    let cx = 32;
    const cy = y;
    const chipH = 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    for (const c of chips) {
      const text = safe(`${c.label}: ${c.value}`);
      const w = doc.getTextWidth(text) + 16;
      if (cx + w > pageWidth - 32) {
        cx = 32;
        y += chipH + 4;
      }
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(RPT_BORDER[0], RPT_BORDER[1], RPT_BORDER[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(cx, y, w, chipH, 9, 9, "FD");
      doc.setTextColor(30, 41, 59);
      doc.text(text, cx + 8, y + 12);
      cx += w + 6;
    }
    y += chipH + 6;
  }

  // Subtle separator
  doc.setDrawColor(RPT_BORDER[0], RPT_BORDER[1], RPT_BORDER[2]);
  doc.setLineWidth(0.5);
  doc.line(32, y + 4, pageWidth - 32, y + 4);

  doc.setTextColor(0);
  return y + 16;
}

/** Draw page-number + wordmark footer on every page. Call AFTER all content rendered. */
function drawPageFooters(doc: jsPDF, label: string) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  // @ts-expect-error getNumberOfPages exists at runtime
  const total: number = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(RPT_BORDER[0], RPT_BORDER[1], RPT_BORDER[2]);
    doc.setLineWidth(0.4);
    doc.line(32, ph - 28, pw - 32, ph - 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(RPT_MUTED[0], RPT_MUTED[1], RPT_MUTED[2]);
    doc.text(label, 32, ph - 14);
    doc.text(`Page ${i} of ${total}`, pw - 32, ph - 14, { align: "right" });
  }
}

/** Build the PDF doc and return the underlying jsPDF instance. */
export function buildReportPdf(opts: ReportPdfOptions, logoDataUrl: string | null = null) {
  const doc = new jsPDF({ orientation: opts.orientation ?? "portrait", unit: "pt", format: "a4" });
  let cursorY = drawReportHeader(doc, opts, logoDataUrl);

  for (const section of opts.sections) {
    if (section.heading) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(RPT_NAVY_DEEP[0], RPT_NAVY_DEEP[1], RPT_NAVY_DEEP[2]);
      doc.text(section.heading, 32, cursorY);
      doc.setTextColor(0);
      cursorY += 6;
    }
    autoTable(doc, {
      startY: cursorY + 4,
      head: [section.columns],
      body: section.rows.map((r) => r.map(fmtCell)),
      foot: section.footer ? [section.footer.map(fmtCell)] : undefined,
      theme: "striped",
      headStyles: { fillColor: RPT_NAVY_DEEP, textColor: 255, fontSize: 9, fontStyle: "bold" },
      bodyStyles: { fontSize: 9, textColor: [15, 23, 42] as any },
      alternateRowStyles: { fillColor: PDF_STRIPE as any },
      footStyles: { fillColor: PDF_TOTAL_FILL, textColor: 15, fontStyle: "bold", fontSize: 9 },
      margin: { left: 32, right: 32, bottom: 40 },
      didParseCell: (data) => {
        if (data.section === "body") {
          const styles = section.rowStyles;
          const indents = section.rowIndents;
          const rowIdx = data.row.index;
          const style = styles?.[rowIdx];
          if (style === "group") {
            data.cell.styles.fillColor = PDF_GROUP_FILL;
            data.cell.styles.fontStyle = "bold";
          } else if (style === "subtotal") {
            data.cell.styles.fillColor = PDF_SUBTOTAL_FILL;
            data.cell.styles.fontStyle = "bold";
          } else if (style === "total") {
            data.cell.styles.fillColor = PDF_TOTAL_FILL;
            data.cell.styles.fontStyle = "bold";
          } else if (style === "muted") {
            data.cell.styles.textColor = [120, 120, 120];
          }
          // First column (GL code in 3-col layouts): mute when it looks numeric.
          const firstCol = data.column.index === 0;
          const isGlCodeCol = section.columns[0] === "GL";
          if (firstCol && isGlCodeCol && !style) {
            data.cell.styles.textColor = [120, 120, 120];
            data.cell.styles.fontSize = 8.5;
          }
          if (data.column.index === 0 && indents && indents[rowIdx]) {
            const lvl = indents[rowIdx];
            data.cell.styles.cellPadding = { top: 4, right: 4, bottom: 4, left: 6 + lvl * 14 };
          }
        }
        const raw = data.cell.raw;
        if (typeof raw === "number") {
          data.cell.styles.halign = "right";
        }
      },
    });
    // @ts-expect-error lastAutoTable is added at runtime by autoTable
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 16;
  }

  drawPageFooters(doc, opts.footerLabel ?? "BusAcTa Operations · Reports");
  return doc;
}

/** Build the PDF and trigger a browser download. Loads the brand logo asynchronously. */
export async function exportReportPdf(opts: ReportPdfOptions) {
  const logo = await ensureInvoiceLogo().catch(() => null);
  buildReportPdf(opts, logo).save(opts.filename);
}

/** Build the PDF and return a Blob with a forced application/pdf MIME type. */
export async function reportPdfBlob(opts: ReportPdfOptions): Promise<Blob> {
  const logo = await ensureInvoiceLogo().catch(() => null);
  const raw = buildReportPdf(opts, logo).output("blob");
  return raw.type === "application/pdf" ? raw : new Blob([raw], { type: "application/pdf" });
}

/** Build the PDF and return an object URL suitable for an <iframe>/<object> preview. */
export async function reportPdfBlobUrl(opts: ReportPdfOptions): Promise<string> {
  return URL.createObjectURL(await reportPdfBlob(opts));
}

/** Convert a transaction amount (in any currency) to INR using fx_rate. */
export function toInr(
  amount: number | null | undefined,
  isForex: boolean,
  fxRate: number | null | undefined,
): number {
  const a = Number(amount ?? 0);
  if (!isForex) return a;
  const r = Number(fxRate ?? 0);
  return a;
}

export function fmtUSD(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(n ?? 0),
  );
}

/* =====================================================================
 *  MODERN GLASS INVOICE PDF
 * ===================================================================== */

export interface InvoicePdfLine {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoicePdfData {
  kind: "invoice" | "proforma";
  invoiceNo: string;
  issueDate: string;
  dueDate?: string;
  status?: string;
  currencySymbol: string; // "$" or "₹"
  isForex: boolean;
  billTo: { name: string; lines?: string[] };
  /** Project this invoice belongs to (one project per invoice). Rendered under invoice number. */
  projectName?: string;
  lines: InvoicePdfLine[];
  subtotal: number;
  tax: number;
  total: number;
  paid?: number;
  balance?: number;
  notes?: string;
  filename: string;
  /** Print-ready: drop tinted backgrounds, decorative shapes and dark fills for a cleaner B/W layout that uses less ink. */
  printMode?: boolean;
}

/** Brand palette — soft glass tones layered on a navy accent. */
const BRAND = {
  navyDeep: [13, 27, 60] as [number, number, number], // #0d1b3c
  navy: [30, 58, 138] as [number, number, number], // #1e3a8a
  navySoft: [59, 130, 246] as [number, number, number], // #3b82f6
  ink: [15, 23, 42] as [number, number, number],
  inkSoft: [71, 85, 105] as [number, number, number],
  muted: [148, 163, 184] as [number, number, number],
  bgTint1: [238, 244, 255] as [number, number, number],
  bgTint2: [248, 250, 252] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  accent: [201, 168, 76] as [number, number, number], // muted gold
  white: [255, 255, 255] as [number, number, number],
};

let _logoDataUrl: string | null = null;
let _logoPromise: Promise<string | null> | null = null;

/** Load the brand logo once and cache it as a base64 data URL for jsPDF. */
export function ensureInvoiceLogo(): Promise<string | null> {
  if (_logoDataUrl) return Promise.resolve(_logoDataUrl);
  if (_logoPromise) return _logoPromise;
  _logoPromise = (async () => {
    try {
      const res = await fetch(logoUrl);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      _logoDataUrl = dataUrl;
      return dataUrl;
    } catch {
      return null;
    }
  })();
  return _logoPromise;
}

function fillRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: [number, number, number],
  radius = 0,
) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  if (radius > 0) doc.roundedRect(x, y, w, h, radius, radius, "F");
  else doc.rect(x, y, w, h, "F");
}

function strokeRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: [number, number, number],
  radius = 0,
  lineWidth = 0.5,
) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(lineWidth);
  if (radius > 0) doc.roundedRect(x, y, w, h, radius, radius, "S");
  else doc.rect(x, y, w, h, "S");
}

/** Glassmorphism card: soft tinted fill, hairline border, faint shadow. */
function glassCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { tint?: [number, number, number]; radius?: number },
) {
  const radius = opts?.radius ?? 10;
  const tint = opts?.tint ?? BRAND.bgTint2;
  // Soft drop shadow
  fillRect(doc, x + 1.5, y + 2, w, h, [225, 230, 240], radius);
  // Glass surface
  fillRect(doc, x, y, w, h, tint, radius);
  // Hairline border
  strokeRect(doc, x, y, w, h, BRAND.border, radius, 0.5);
}

function setText(
  doc: jsPDF,
  rgb: [number, number, number],
  size: number,
  weight: "normal" | "bold" = "normal",
) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  doc.setFont("helvetica", weight);
  doc.setFontSize(size);
}

function fmt(n: number, sym: string): string {
  const v = Number(n || 0);
  const s = v.toLocaleString(sym === "₹" ? "en-IN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sym} ${s}`;
}

export function buildInvoicePdf(data: InvoicePdfData, logoDataUrl: string | null): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const M = 36; // outer margin
  const print = !!data.printMode;

  // Print palette overrides — keep the palette object intact, derive locals.
  const C = {
    headingDark: print ? ([20, 20, 20] as [number, number, number]) : BRAND.navyDeep,
    accent: print ? ([80, 80, 80] as [number, number, number]) : BRAND.accent,
    cardTint: print ? ([255, 255, 255] as [number, number, number]) : BRAND.bgTint2,
    headerCard: [255, 255, 255] as [number, number, number],
    totalsFill: print ? ([240, 240, 240] as [number, number, number]) : BRAND.navyDeep,
    totalsText: print ? BRAND.ink : BRAND.white,
    footerFill: print ? ([255, 255, 255] as [number, number, number]) : BRAND.navyDeep,
    footerText: print ? BRAND.ink : BRAND.white,
    footerSub: print ? BRAND.inkSoft : ([203, 213, 225] as [number, number, number]),
  };

  // ---------- Background ----------
  fillRect(doc, 0, 0, pw, ph, BRAND.white);
  if (!print) {
    fillRect(doc, 0, 0, pw, 220, BRAND.bgTint1);
    fillRect(doc, 0, 180, pw, 80, [243, 247, 255]);
    // Decorative accents (omit in print mode)
    doc.setFillColor(BRAND.navyDeep[0], BRAND.navyDeep[1], BRAND.navyDeep[2]);
    doc.circle(pw + 30, -10, 110, "F");
    doc.setFillColor(BRAND.navy[0], BRAND.navy[1], BRAND.navy[2]);
    doc.circle(pw - 60, -30, 70, "F");
    doc.setFillColor(BRAND.accent[0], BRAND.accent[1], BRAND.accent[2]);
    doc.circle(pw - 110, 10, 14, "F");
  }

  // ---------- Header card ----------
  const headerY = M;
  const headerH = 96;
  if (print) {
    strokeRect(doc, M, headerY, pw - 2 * M, headerH, BRAND.border, 14, 0.5);
  } else {
    glassCard(doc, M, headerY, pw - 2 * M, headerH, { tint: C.headerCard, radius: 14 });
  }

  // Logo (left)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", M + 16, headerY + 18, 150, 52);
    } catch {
      /* ignore */
    }
  } else {
    setText(doc, C.headingDark, 18, "bold");
    doc.text("BusAcTa Advisors", M + 16, headerY + 42);
  }

  setText(doc, BRAND.inkSoft, 8, "normal");
  doc.text("Offshore Accounting & Tax Solutions", M + 16, headerY + 80);

  // Right side: INVOICE label + number — wrap long invoice numbers safely
  const rightX = pw - M - 16;
  setText(doc, C.headingDark, 24, "bold");
  doc.text(data.kind === "proforma" ? "PROFORMA" : "INVOICE", rightX, headerY + 34, {
    align: "right",
  });
  fillRect(doc, rightX - 80, headerY + 40, 80, 2.5, C.accent, 1);
  setText(doc, BRAND.inkSoft, 8.5, "normal");
  doc.text("INVOICE NO.", rightX, headerY + 58, { align: "right" });
  setText(doc, BRAND.ink, 12, "bold");
  const invNoLines = doc.splitTextToSize(data.invoiceNo, 200);
  doc.text(invNoLines.slice(0, 2), rightX, headerY + 74, { align: "right" });
  if (data.projectName) {
    setText(doc, BRAND.inkSoft, 8.5, "normal");
    const projLines = doc.splitTextToSize(`Project: ${data.projectName}`, 220);
    doc.text(projLines.slice(0, 1), rightX, headerY + 88, { align: "right" });
  }

  // ---------- Meta row ----------
  const metaY = headerY + headerH + 16;
  const metaH = 116;
  const gap = 16;
  const metaW = (pw - 2 * M - gap) / 2;

  // Bill To card
  if (print) strokeRect(doc, M, metaY, metaW, metaH, BRAND.border, 10, 0.5);
  else glassCard(doc, M, metaY, metaW, metaH, { tint: C.cardTint, radius: 10 });

  setText(doc, BRAND.muted, 8, "bold");
  doc.text("BILL TO", M + 16, metaY + 20);
  // Wrap long company names — keep weight consistent (semibold-ish via bold + smaller size when very long)
  const billNameRaw = (data.billTo.name || "—").trim();
  const billNameWrapped = doc.splitTextToSize(billNameRaw, metaW - 32);
  const billSize = billNameWrapped.length > 1 || billNameRaw.length > 32 ? 11 : 13;
  setText(doc, BRAND.ink, billSize, "bold");
  let bnY = metaY + 38;
  for (const ln of billNameWrapped.slice(0, 2)) {
    doc.text(ln, M + 16, bnY);
    bnY += billSize + 2;
  }
  setText(doc, BRAND.inkSoft, 9, "normal");
  let bty = bnY + 6;
  for (const ln of (data.billTo.lines ?? []).slice(0, 4)) {
    const wrapped = doc.splitTextToSize(ln, metaW - 32);
    for (const w of wrapped) {
      if (bty > metaY + metaH - 12) break;
      doc.text(w, M + 16, bty);
      bty += 12;
    }
  }

  // Right meta card
  const rx = M + metaW + gap;
  if (print) strokeRect(doc, rx, metaY, metaW, metaH, BRAND.border, 10, 0.5);
  else glassCard(doc, rx, metaY, metaW, metaH, { tint: C.cardTint, radius: 10 });
  const col1 = rx + 16;
  const col2 = rx + metaW / 2 + 6;

  setText(doc, BRAND.muted, 8, "bold");
  doc.text("ISSUE DATE", col1, metaY + 20);
  doc.text("DUE DATE", col2, metaY + 20);
  setText(doc, BRAND.ink, 11, "bold");
  doc.text(data.issueDate || "—", col1, metaY + 36);
  doc.text(data.dueDate || "—", col2, metaY + 36);

  setText(doc, BRAND.muted, 8, "bold");
  doc.text("STATUS", col1, metaY + 60);
  doc.text("CURRENCY", col2, metaY + 60);
  setText(doc, BRAND.ink, 11, "bold");
  doc.text((data.status ?? "—").toUpperCase(), col1, metaY + 76);
  doc.text(data.isForex ? "USD" : "INR", col2, metaY + 76);

  // ACH details inside right card lower area — proper line wrapping
  setText(doc, BRAND.muted, 7.5, "bold");
  doc.text("ACH PAYMENT DETAILS", rx + 16, metaY + 96);
  setText(doc, BRAND.inkSoft, 7.5, "normal");
  doc.text("Bank: Column National Asso.  •  RTN: 084009519", rx + 16, metaY + 107);
  doc.text("A/C: 170552827412057  •  Type: Checking", rx + 16, metaY + 117);

  // ---------- Line items table ----------
  const tableY = metaY + metaH + 18;
  autoTable(doc, {
    startY: tableY,
    head: [["#", "DESCRIPTION", "QTY", "RATE", "AMOUNT"]],
    body: data.lines.map((l, i) => [
      String(i + 1),
      l.description,
      String(l.quantity),
      fmt(l.rate, data.currencySymbol),
      fmt(l.amount, data.currencySymbol),
    ]),
    theme: "plain",
    margin: { left: M, right: M },
    styles: {
      fontSize: 9.5,
      cellPadding: { top: 9, right: 10, bottom: 9, left: 10 },
      textColor: BRAND.ink as any,
      lineColor: BRAND.border as any,
      lineWidth: 0.3,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: (print ? [235, 235, 235] : BRAND.navyDeep) as any,
      textColor: (print ? BRAND.ink : [255, 255, 255]) as any,
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: { top: 10, right: 10, bottom: 10, left: 10 },
    },
    bodyStyles: { fillColor: [255, 255, 255] as any },
    alternateRowStyles: { fillColor: (print ? [250, 250, 250] : [248, 250, 254]) as any },
    columnStyles: {
      0: { cellWidth: 28, halign: "center", textColor: BRAND.muted as any },
      1: { cellWidth: "auto" as any },
      2: { cellWidth: 50, halign: "right" },
      3: { cellWidth: 80, halign: "right" },
      4: { cellWidth: 92, halign: "right", fontStyle: "bold" },
    },
  });

  // @ts-expect-error lastAutoTable is added at runtime
  let cy: number = (doc.lastAutoTable?.finalY ?? tableY) + 22;

  // ---------- Totals card (right) ----------
  const totalsW = 244;
  const totalsX = pw - M - totalsW;
  const sym = data.currencySymbol;
  const showPaid = typeof data.paid === "number" && (data.paid ?? 0) > 0;
  const totalsH = showPaid ? 122 : 92;
  if (print) strokeRect(doc, totalsX, cy, totalsW, totalsH, BRAND.border, 12, 0.5);
  else glassCard(doc, totalsX, cy, totalsW, totalsH, { tint: [255, 255, 255], radius: 12 });

  let ty = cy + 24;
  setText(doc, BRAND.inkSoft, 9.5, "normal");
  doc.text("Subtotal", totalsX + 18, ty);
  setText(doc, BRAND.ink, 9.5, "bold");
  doc.text(fmt(data.subtotal, sym), totalsX + totalsW - 18, ty, { align: "right" });
  ty += 18;
  setText(doc, BRAND.inkSoft, 9.5, "normal");
  doc.text("Tax", totalsX + 18, ty);
  setText(doc, BRAND.ink, 9.5, "bold");
  doc.text(fmt(data.tax, sym), totalsX + totalsW - 18, ty, { align: "right" });
  ty += 10;
  doc.setDrawColor(BRAND.border[0], BRAND.border[1], BRAND.border[2]);
  doc.setLineWidth(0.4);
  doc.line(totalsX + 14, ty, totalsX + totalsW - 14, ty);
  ty += 20;
  // Total row
  fillRect(doc, totalsX + 8, ty - 16, totalsW - 16, 26, C.totalsFill, 6);
  setText(doc, C.totalsText, 10.5, "bold");
  doc.text("TOTAL", totalsX + 20, ty + 2);
  setText(doc, C.totalsText, 13, "bold");
  doc.text(fmt(data.total, sym), totalsX + totalsW - 20, ty + 2, { align: "right" });
  ty += 24;

  if (showPaid) {
    setText(doc, BRAND.inkSoft, 9, "normal");
    doc.text("Paid", totalsX + 18, ty);
    setText(doc, BRAND.ink, 9, "bold");
    doc.text(fmt(data.paid ?? 0, sym), totalsX + totalsW - 18, ty, { align: "right" });
    ty += 14;
    setText(doc, BRAND.inkSoft, 9, "normal");
    doc.text("Balance Due", totalsX + 18, ty);
    setText(doc, print ? BRAND.ink : BRAND.accent, 10, "bold");
    doc.text(fmt(data.balance ?? data.total - (data.paid ?? 0), sym), totalsX + totalsW - 18, ty, {
      align: "right",
    });
  }

  // ---------- Notes (left of totals) ----------
  if (data.notes) {
    const notesW = pw - 2 * M - totalsW - 16;
    if (print) strokeRect(doc, M, cy, notesW, totalsH, BRAND.border, 12, 0.5);
    else glassCard(doc, M, cy, notesW, totalsH, { tint: C.cardTint, radius: 12 });
    setText(doc, BRAND.muted, 8, "bold");
    doc.text("NOTES", M + 16, cy + 20);
    setText(doc, BRAND.inkSoft, 9, "normal");
    const wrapped = doc.splitTextToSize(data.notes, notesW - 32);
    let nyy = cy + 36;
    for (const w of wrapped.slice(0, 6)) {
      doc.text(w, M + 16, nyy);
      nyy += 12;
    }
  }

  cy += totalsH + 24;

  // ---------- Signature & thanks ----------
  setText(doc, BRAND.inkSoft, 9, "normal");
  doc.text("For BusAcTa Advisors LLP", M, cy + 8);
  doc.setDrawColor(BRAND.muted[0], BRAND.muted[1], BRAND.muted[2]);
  doc.setLineWidth(0.4);
  doc.line(M, cy + 46, M + 170, cy + 46);
  setText(doc, BRAND.ink, 10.5, "bold");
  doc.text("Viral Patel, CPA, CA", M, cy + 60);
  setText(doc, BRAND.muted, 8, "normal");
  doc.text("Authorised Signatory", M, cy + 72);

  setText(doc, C.headingDark, 13, "bold");
  doc.text("Thank you for your business!", pw - M, cy + 32, { align: "right" });
  setText(doc, BRAND.muted, 8, "normal");
  doc.text("Payable within terms stated above.", pw - M, cy + 48, { align: "right" });

  // ---------- Footer ----------
  const fy = ph - 50;
  fillRect(doc, 0, fy, pw, 50, C.footerFill);
  if (print) {
    doc.setDrawColor(BRAND.border[0], BRAND.border[1], BRAND.border[2]);
    doc.setLineWidth(0.5);
    doc.line(M, fy + 6, pw - M, fy + 6);
  } else {
    fillRect(doc, 0, fy, pw, 2, BRAND.accent);
  }
  setText(doc, C.footerText, 9, "bold");
  doc.text("BusAcTa Advisors LLP", M, fy + 22);
  setText(doc, C.footerSub, 8, "normal");
  doc.text("701, Centrum Heights, New Vadaj, Ahmedabad, Gujarat 380061", M, fy + 36);
  setText(doc, C.footerText, 8, "normal");
  doc.text("viral.patel@busacta.com   •   +1 (224) 409 4667", pw - M, fy + 22, { align: "right" });
  setText(doc, C.footerSub, 8, "normal");
  doc.text("www.busacta.com", pw - M, fy + 36, { align: "right" });

  return doc;
}

export function invoicePdfBlob(data: InvoicePdfData, logoDataUrl: string | null): Blob {
  const raw = buildInvoicePdf(data, logoDataUrl).output("blob");
  return raw.type === "application/pdf" ? raw : new Blob([raw], { type: "application/pdf" });
}

export function exportInvoicePdf(data: InvoicePdfData, logoDataUrl: string | null) {
  buildInvoicePdf(data, logoDataUrl).save(data.filename);
}
