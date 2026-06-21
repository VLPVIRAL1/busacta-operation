/**
 * PDF Template Renderer — converts a PdfTemplate + PdfTemplateField[] + live data
 * into a pdfmake TDocumentDefinitions and produces a PDF buffer/data URL.
 *
 * Works both browser-side (for live preview) and server-side (for export endpoint).
 */
import type { TDocumentDefinitions, Content, StyleDictionary } from "pdfmake/interfaces";
import type { PdfTemplate, PdfTemplateField } from "./schemas";
import type {
  LineItemsTableConfig,
  LogoConfig,
  NotesBlockConfig,
  PlaceholderConfig,
  SectionConfig,
  SignatureBlockConfig,
  SpacerConfig,
  StaticTextConfig,
  TotalsBlockConfig,
} from "./schemas";
import { substitutePdfPlaceholders } from "./placeholders";
import type { SampleData, SampleLineItem, SampleReportRow } from "./sample-data";

// ─── pdfmake lazy-loader ──────────────────────────────────────────────────────

let _pdfMake: typeof import("pdfmake/build/pdfmake") | null = null;

async function getPdfMake() {
  if (_pdfMake) return _pdfMake;
  const pdfMake = await import("pdfmake/build/pdfmake");
  const pdfFonts = await import("pdfmake/build/vfs_fonts");
  const lib = pdfMake.default ?? (pdfMake as unknown as typeof import("pdfmake/build/pdfmake"));
  const fonts = pdfFonts as unknown as {
    default?: { pdfMake?: { vfs?: Record<string, string> } };
    pdfMake?: { vfs?: Record<string, string> };
  };
  const vfs = fonts.default?.pdfMake?.vfs ?? fonts.pdfMake?.vfs ?? {};
  (lib as unknown as { vfs: Record<string, string> }).vfs = vfs;
  _pdfMake = lib;
  return lib;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function hexToRgbArray(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

// Lighten a hex color by mixing with white at given ratio (0-1)
function lighten(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgbArray(hex);
  const lr = Math.round(r + (255 - r) * ratio);
  const lg = Math.round(g + (255 - g) * ratio);
  const lb = Math.round(b + (255 - b) * ratio);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

// ─── Number formatting ────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n === 0) return "—";
  if (n < 0) return `(${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })})`;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ─── Main render entry ────────────────────────────────────────────────────────

export async function renderPdfDataUrl(
  template: PdfTemplate,
  fields: PdfTemplateField[],
  data: SampleData,
): Promise<string> {
  const lib = await getPdfMake();
  const docDef = buildDocDefinition(template, fields, data);
  return new Promise((resolve, reject) => {
    (
      lib as unknown as {
        createPdf: (def: TDocumentDefinitions) => {
          getDataUrl: (cb: (url: string) => void) => void;
        };
      }
    )
      .createPdf(docDef)
      .getDataUrl((url) => {
        if (!url) reject(new Error("Failed to generate PDF data URL"));
        else resolve(url);
      });
  });
}

export async function renderPdfBuffer(
  template: PdfTemplate,
  fields: PdfTemplateField[],
  data: SampleData,
): Promise<ArrayBuffer> {
  const lib = await getPdfMake();
  const docDef = buildDocDefinition(template, fields, data);
  return new Promise((resolve, reject) => {
    (
      lib as unknown as {
        createPdf: (def: TDocumentDefinitions) => {
          getBuffer: (cb: (buf: ArrayBuffer) => void) => void;
        };
      }
    )
      .createPdf(docDef)
      .getBuffer((buf) => {
        if (!buf) reject(new Error("Failed to generate PDF buffer"));
        else resolve(buf);
      });
  });
}

// ─── Document definition builder ─────────────────────────────────────────────

function buildDocDefinition(
  template: PdfTemplate,
  fields: PdfTemplateField[],
  data: SampleData,
): TDocumentDefinitions {
  const primary = template.primary_color || "#1e3a8a";
  const secondary = template.secondary_color || "#c9a84c";
  const font = template.font_family || "Helvetica";

  // Build content from root-level fields (parent_id = null) in order
  const rootFields = fields
    .filter((f) => !f.parent_id)
    .sort((a, b) => a.order_index - b.order_index);

  const content: Content[] = [];
  for (const field of rootFields) {
    const children = fields
      .filter((f) => f.parent_id === field.id)
      .sort((a, b) => a.order_index - b.order_index);
    if (!field.is_visible) continue;
    content.push(...renderField(field, children, data, primary, secondary));
  }

  return {
    pageSize: (template.page_size || "A4") as "A4",
    pageOrientation: (template.orientation || "portrait") as "portrait" | "landscape",
    pageMargins: [
      Number(template.margin_left) || 40,
      Number(template.margin_top) || 40,
      Number(template.margin_right) || 40,
      Number(template.margin_bottom) || 40,
    ],
    content: content.length > 0 ? content : [{ text: "No fields added yet.", color: "#94a3b8" }],
    styles: buildStyles(primary, secondary),
    defaultStyle: { font, fontSize: 10, color: "#0f172a" },
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function buildStyles(primary: string, secondary: string): StyleDictionary {
  return {
    sectionHeader: {
      fontSize: 9,
      bold: true,
      color: "#64748b",
      margin: [0, 12, 0, 4] as [number, number, number, number],
    },
    tableHeader: { bold: true, color: "#ffffff", fillColor: primary, fontSize: 9 },
    tableCell: { fontSize: 9, color: "#334155" },
    tableCellRight: { fontSize: 9, color: "#334155", alignment: "right" as const },
    totalRow: { bold: true, fontSize: 10, color: primary },
    subtotalRow: { fontSize: 9, color: "#475569" },
    groupRow: {
      bold: true,
      fontSize: 9,
      color: secondary,
      margin: [0, 6, 0, 2] as [number, number, number, number],
    },
    placeholder: { fontSize: 10, color: "#0f172a" },
    staticText: { fontSize: 10, color: "#334155" },
    signatureLine: { fontSize: 9, color: "#64748b" },
    paymentDetail: { fontSize: 9, color: "#475569" },
    notesText: { fontSize: 9, color: "#475569", italics: true },
  };
}

// ─── Field renderer dispatcher ────────────────────────────────────────────────

function renderField(
  field: PdfTemplateField,
  children: PdfTemplateField[],
  data: SampleData,
  primary: string,
  secondary: string,
): Content[] {
  const cfg = field.config_json as Record<string, unknown>;

  switch (field.field_type) {
    case "section":
      return renderSection(field, children, data, primary, secondary);
    case "logo":
      return renderLogo(cfg as LogoConfig, data, primary);
    case "static_text":
      return renderStaticText(cfg as unknown as StaticTextConfig, data);
    case "placeholder":
      return renderPlaceholder(cfg as unknown as PlaceholderConfig, data);
    case "divider":
      return [renderDivider()];
    case "spacer":
      return [renderSpacer(cfg as unknown as SpacerConfig)];
    case "line_items_table":
      return renderLineItemsTable(cfg as LineItemsTableConfig, data, primary);
    case "totals_block":
      return renderTotalsBlock(cfg as TotalsBlockConfig, data, primary);
    case "earnings_deductions_table":
      return renderEarningsDeductionsTable(data, primary);
    case "report_table":
      return renderReportTable(data, primary, secondary);
    case "signature_block":
      return renderSignatureBlock(cfg as SignatureBlockConfig);
    case "payment_details":
      return renderPaymentDetails(data);
    case "notes_block":
      return renderNotesBlock(cfg as NotesBlockConfig, data);
    default:
      return [];
  }
}

// ─── Section ──────────────────────────────────────────────────────────────────

function renderSection(
  field: PdfTemplateField,
  children: PdfTemplateField[],
  data: SampleData,
  primary: string,
  secondary: string,
): Content[] {
  const cfg = field.config_json as SectionConfig;
  const columns = cfg.columns ?? 1;

  const childContent: Content[] = [];
  for (const child of children) {
    if (!child.is_visible) continue;
    childContent.push(...renderField(child, [], data, primary, secondary));
  }

  const label = field.label;
  const out: Content[] = [];

  if (label) {
    out.push({ text: label.toUpperCase(), style: "sectionHeader" });
  }

  if (columns === 2 && childContent.length >= 2) {
    const mid = Math.ceil(childContent.length / 2);
    out.push({
      columns: [
        { stack: childContent.slice(0, mid), width: "*" },
        { stack: childContent.slice(mid), width: "*" },
      ],
      columnGap: 20,
    } as Content);
  } else if (columns === 3 && childContent.length >= 3) {
    const third = Math.ceil(childContent.length / 3);
    out.push({
      columns: [
        { stack: childContent.slice(0, third), width: "*" },
        { stack: childContent.slice(third, third * 2), width: "*" },
        { stack: childContent.slice(third * 2), width: "*" },
      ],
      columnGap: 12,
    } as Content);
  } else {
    out.push(...childContent);
  }

  return out;
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function renderLogo(cfg: LogoConfig, data: SampleData, primary: string): Content[] {
  const logoDataUrl = data.__logoDataUrl as string | undefined;
  const alignment = cfg.alignment ?? "left";
  const width = cfg.width ?? 80;

  if (logoDataUrl) {
    return [{ image: logoDataUrl, width, alignment } as Content];
  }
  // Fallback: company name as styled text
  const companyName = (data.company_name as string) || "Company";
  return [
    {
      text: companyName,
      fontSize: 18,
      bold: true,
      color: primary,
      alignment,
      margin: [0, 0, 0, 4],
    } as Content,
  ];
}

// ─── Static text ──────────────────────────────────────────────────────────────

function renderStaticText(cfg: StaticTextConfig, data: SampleData): Content[] {
  const text = substitutePdfPlaceholders(cfg.content ?? "", data as Record<string, unknown>);
  return [
    {
      text,
      fontSize: cfg.font_size ?? 10,
      bold: cfg.bold ?? false,
      italics: cfg.italic ?? false,
      color: cfg.color ?? "#334155",
      alignment: cfg.alignment ?? "left",
      margin: [0, 2, 0, 2],
    } as Content,
  ];
}

// ─── Placeholder ─────────────────────────────────────────────────────────────

function renderPlaceholder(cfg: PlaceholderConfig, data: SampleData): Content[] {
  const key = cfg.token?.replace(/\{\{|\}\}/g, "").trim() ?? "";
  const raw = data[key];
  const value = raw !== undefined && raw !== null ? String(raw) : (cfg.fallback ?? `{{${key}}}`);
  const text = (cfg.prefix ?? "") + value + (cfg.suffix ?? "");
  return [
    {
      text,
      fontSize: cfg.font_size ?? 10,
      bold: cfg.bold ?? false,
      color: cfg.color ?? "#0f172a",
      margin: [0, 1, 0, 1],
    } as Content,
  ];
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function renderDivider(): Content {
  return {
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#e2e8f0" }],
    margin: [0, 8, 0, 8],
  } as Content;
}

// ─── Spacer ───────────────────────────────────────────────────────────────────

function renderSpacer(cfg: SpacerConfig): Content {
  return { text: "", margin: [0, (cfg.height ?? 12) / 2, 0, (cfg.height ?? 12) / 2] } as Content;
}

// ─── Line items table ─────────────────────────────────────────────────────────

function renderLineItemsTable(
  cfg: LineItemsTableConfig,
  data: SampleData,
  primary: string,
): Content[] {
  const items = (data.line_items as SampleLineItem[]) ?? [];
  const showIdx = cfg.show_index !== false;
  const showQty = cfg.show_quantity !== false;
  const showRate = cfg.show_rate !== false;
  const headerColor = cfg.header_color ?? primary;
  const headerLight = lighten(headerColor, 0.9);

  const headers: string[] = [];
  if (showIdx) headers.push("#");
  headers.push("Description");
  if (showQty) headers.push("Qty");
  if (showRate) headers.push("Rate");
  headers.push("Amount");

  const widths: (string | number)[] = [];
  if (showIdx) widths.push(20);
  widths.push("*");
  if (showQty) widths.push(40);
  if (showRate) widths.push(60);
  widths.push(70);

  const headerRow = headers.map((h) => ({
    text: h,
    style: "tableHeader",
    fillColor: headerColor,
    alignment: ["Amount", "Rate", "Qty"].includes(h) ? "right" : "left",
  }));

  const bodyRows = items.map((item, i) => {
    const row: Content[] = [];
    if (showIdx)
      row.push({ text: String(i + 1), style: "tableCell", alignment: "center" } as Content);
    row.push({ text: item.description, style: "tableCell" } as Content);
    if (showQty)
      row.push({
        text: String(item.quantity),
        style: "tableCellRight",
        alignment: "right",
      } as Content);
    if (showRate)
      row.push({ text: fmtNum(item.rate), style: "tableCellRight", alignment: "right" } as Content);
    row.push({ text: fmtNum(item.amount), style: "tableCellRight", alignment: "right" } as Content);
    return row;
  });

  if (bodyRows.length === 0) {
    const emptyRow: Content[] = [];
    if (showIdx) emptyRow.push({ text: "—", style: "tableCell", alignment: "center" } as Content);
    emptyRow.push({ text: "No line items", style: "tableCell", color: "#94a3b8" } as Content);
    if (showQty) emptyRow.push({ text: "—", style: "tableCellRight" } as Content);
    if (showRate) emptyRow.push({ text: "—", style: "tableCellRight" } as Content);
    emptyRow.push({ text: "—", style: "tableCellRight" } as Content);
    bodyRows.push(emptyRow);
  }

  return [
    {
      table: {
        headerRows: 1,
        widths,
        body: [headerRow, ...bodyRows],
      },
      layout: {
        hLineWidth: (i: number) => (i === 0 || i === 1 ? 0 : 0.5),
        vLineWidth: () => 0,
        hLineColor: () => "#e2e8f0",
        fillColor: (_: number, row: { index?: number } | null) => {
          if (!row) return null;
          const idx = (row as { index?: number }).index ?? 0;
          return idx % 2 === 0 ? null : headerLight;
        },
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 5,
        paddingBottom: () => 5,
      },
      margin: [0, 8, 0, 4],
    } as Content,
  ];
}

// ─── Totals block ─────────────────────────────────────────────────────────────

function renderTotalsBlock(cfg: TotalsBlockConfig, data: SampleData, primary: string): Content[] {
  const rows: Array<{ label: string; value: string; isTotal?: boolean }> = [];

  if (cfg.show_subtotal !== false)
    rows.push({ label: "Subtotal", value: String(data.subtotal ?? "—") });
  if (cfg.show_tax !== false)
    rows.push({ label: "Tax / GST", value: String(data.tax_amount ?? "—") });
  if (cfg.show_total !== false)
    rows.push({ label: "Total", value: String(data.total_amount ?? "—"), isTotal: true });
  if (cfg.show_amount_paid !== false && data.amount_paid !== undefined)
    rows.push({ label: "Amount Paid", value: String(data.amount_paid) });
  if (cfg.show_balance_due !== false && data.balance_due !== undefined)
    rows.push({ label: "Balance Due", value: String(data.balance_due), isTotal: true });

  const tableBody = rows.map((r) => [
    {
      text: r.label,
      alignment: "right" as const,
      bold: r.isTotal,
      color: r.isTotal ? primary : "#475569",
      fontSize: r.isTotal ? 11 : 9,
    },
    {
      text: r.value,
      alignment: "right" as const,
      bold: r.isTotal,
      color: r.isTotal ? primary : "#334155",
      fontSize: r.isTotal ? 11 : 9,
    },
  ]);

  return [
    {
      table: {
        widths: ["*", 80],
        body: tableBody.length > 0 ? tableBody : [[{ text: "" }, { text: "" }]],
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[][] } }) =>
          i === node.table.body.length ? 1 : 0.5,
        vLineWidth: () => 0,
        hLineColor: () => "#e2e8f0",
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [100, 8, 0, 8],
    } as Content,
  ];
}

// ─── Earnings / deductions ────────────────────────────────────────────────────

function renderEarningsDeductionsTable(data: SampleData, primary: string): Content[] {
  const earnings = (data.earnings as Array<{ label: string; amount: number }>) ?? [];
  const deductions = (data.deductions as Array<{ label: string; amount: number }>) ?? [];

  const earningsRows = earnings.map((e) => [
    { text: e.label, style: "tableCell" as const },
    { text: fmtNum(e.amount), style: "tableCellRight" as const, alignment: "right" as const },
  ]);
  const deductionsRows = deductions.map((d) => [
    { text: d.label, style: "tableCell" as const },
    { text: fmtNum(d.amount), style: "tableCellRight" as const, alignment: "right" as const },
  ]);

  const earningsTotal = earnings.reduce((s, e) => s + e.amount, 0);
  const deductionsTotal = deductions.reduce((s, d) => s + d.amount, 0);

  return [
    {
      columns: [
        {
          width: "*",
          table: {
            headerRows: 1,
            widths: ["*", 80],
            body: [
              [
                { text: "Earnings", style: "tableHeader", fillColor: primary },
                { text: "Amount", style: "tableHeader", fillColor: primary, alignment: "right" },
              ],
              ...earningsRows,
              [
                { text: "Gross Salary", bold: true, color: primary },
                { text: fmtNum(earningsTotal), bold: true, color: primary, alignment: "right" },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            hLineColor: () => "#e2e8f0",
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
        },
        { width: 20, text: "" },
        {
          width: "*",
          table: {
            headerRows: 1,
            widths: ["*", 80],
            body: [
              [
                { text: "Deductions", style: "tableHeader", fillColor: primary },
                { text: "Amount", style: "tableHeader", fillColor: primary, alignment: "right" },
              ],
              ...deductionsRows,
              [
                { text: "Total Deductions", bold: true, color: "#dc2626" },
                { text: fmtNum(deductionsTotal), bold: true, color: "#dc2626", alignment: "right" },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            hLineColor: () => "#e2e8f0",
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
        },
      ],
      margin: [0, 8, 0, 8],
    } as Content,
  ];
}

// ─── Report table ─────────────────────────────────────────────────────────────

function renderReportTable(data: SampleData, primary: string, secondary: string): Content[] {
  const rows = (data.report_rows as SampleReportRow[]) ?? [];

  const bodyRows = rows.map((r) => {
    const isTotal = r.style === "total";
    const isSubtotal = r.style === "subtotal";
    const isGroup = r.style === "group";
    const color = isTotal ? primary : isGroup ? secondary : "#334155";
    return [
      { text: r.label, bold: isTotal || isSubtotal || isGroup, color, fontSize: isTotal ? 10 : 9 },
      {
        text: r.style === "group" ? "" : fmtNum(r.amount),
        alignment: "right" as const,
        bold: isTotal || isSubtotal,
        color,
        fontSize: isTotal ? 10 : 9,
      },
    ];
  });

  return [
    {
      table: {
        headerRows: 1,
        widths: ["*", 100],
        body: [
          [
            { text: "Description", style: "tableHeader", fillColor: primary },
            { text: "Amount", style: "tableHeader", fillColor: primary, alignment: "right" },
          ],
          ...(bodyRows.length > 0
            ? bodyRows
            : [[{ text: "No data", color: "#94a3b8" }, { text: "—" }]]),
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => "#e2e8f0",
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 8, 0, 8],
    } as Content,
  ];
}

// ─── Signature block ──────────────────────────────────────────────────────────

function renderSignatureBlock(cfg: SignatureBlockConfig): Content[] {
  const name = cfg.signatory_name ?? "Authorised Signatory";
  const title = cfg.signatory_title ?? "";
  const showDate = cfg.show_date_line !== false;

  return [
    { text: "", margin: [0, 24, 0, 0] } as Content,
    {
      columns: [
        { width: "*", text: "" },
        {
          width: 180,
          stack: [
            {
              canvas: [
                {
                  type: "line",
                  x1: 0,
                  y1: 0,
                  x2: 180,
                  y2: 0,
                  lineWidth: 0.8,
                  lineColor: "#94a3b8",
                },
              ],
            },
            { text: name, fontSize: 9, bold: true, margin: [0, 3, 0, 0] },
            ...(title ? [{ text: title, fontSize: 8, color: "#64748b" }] : []),
            ...(showDate
              ? [
                  { text: "", margin: [0, 12, 0, 0] },
                  {
                    canvas: [
                      {
                        type: "line",
                        x1: 0,
                        y1: 0,
                        x2: 180,
                        y2: 0,
                        lineWidth: 0.8,
                        lineColor: "#94a3b8",
                      },
                    ],
                  },
                  { text: "Date", fontSize: 8, color: "#64748b", margin: [0, 3, 0, 0] },
                ]
              : []),
          ],
        },
      ],
      margin: [0, 16, 0, 0],
    } as Content,
  ];
}

// ─── Payment details ──────────────────────────────────────────────────────────

function renderPaymentDetails(data: SampleData): Content[] {
  const company = String(data.company_name ?? "");
  return [
    {
      text: "Payment Instructions",
      bold: true,
      fontSize: 9,
      color: "#475569",
      margin: [0, 12, 0, 4],
    } as Content,
    {
      table: {
        widths: [100, "*"],
        body: [
          [
            { text: "Bank Name", style: "paymentDetail" },
            { text: "HDFC Bank", style: "paymentDetail" },
          ],
          [
            { text: "Account Name", style: "paymentDetail" },
            { text: company, style: "paymentDetail" },
          ],
          [
            { text: "Account No.", style: "paymentDetail" },
            { text: "XXXX-XXXX-1234", style: "paymentDetail" },
          ],
          [
            { text: "IFSC Code", style: "paymentDetail" },
            { text: "HDFC0001234", style: "paymentDetail" },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.3,
        vLineWidth: () => 0,
        hLineColor: () => "#e2e8f0",
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
      margin: [0, 0, 0, 8],
    } as Content,
  ];
}

// ─── Notes block ──────────────────────────────────────────────────────────────

function renderNotesBlock(cfg: NotesBlockConfig, data: SampleData): Content[] {
  const rawContent = cfg.content ?? (data.notes as string) ?? "";
  const label = cfg.label ?? "Notes";
  const text = substitutePdfPlaceholders(rawContent, data as Record<string, unknown>);
  if (!text) return [];
  return [
    { text: label, bold: true, fontSize: 9, color: "#475569", margin: [0, 12, 0, 4] } as Content,
    { text, style: "notesText", margin: [0, 0, 0, 8] } as Content,
  ];
}
