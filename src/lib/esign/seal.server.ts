/**
 * Phase 4 — Cryptographic sealing + ESIGN/UETA Certificate of Completion.
 *
 * Pipeline when the final signer submits:
 *   1. Download all source PDFs from `esign-source`, merge into one document,
 *      and draw every recipient's field values (text + signature/initial images)
 *      at their stored normalised coordinates.
 *   2. Append the signer ID verification appendix (uploaded ID docs) verbatim.
 *   3. Save these "base" bytes and compute SHA-256 over them — this hash
 *      covers the contract + ID appendix only (certificate is excluded so it
 *      can reference the hash without a cycle).
 *   4. Build a stark black-and-white Certificate of Completion containing the
 *      cover/metadata/checksum lockbox, per-signer ledger cards with security
 *      telemetry, the full audit trail table, and the legal compliance footer.
 *   5. Append the certificate pages onto the base PDF and upload as the final
 *      `<envelopeId>/sealed.pdf`. Also upload the standalone certificate
 *      bytes to `<envelopeId>/certificate.pdf`.
 *   6. Insert `esign_completed_documents` with hash + telemetry metadata, set
 *      envelope status to completed, and write `envelope_sealed` audit entry.
 *
 * Runs server-side only. Best-effort — the caller wraps in try/catch.
 */
import { createHash, randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VERIFY_PATH = "/verify";

function newSlug(): string {
  return randomBytes(16).toString("hex");
}

async function downloadPdf(path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin.storage.from("esign-source").download(path);
  if (error || !data) throw new Error(`download ${path}: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function downloadSignatureImage(path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from("esign-signatures").download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function downloadIdDoc(path: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const { data, error } = await supabaseAdmin.storage.from("esign-id-docs").download(path);
  if (error || !data) return null;
  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    mime: data.type || (path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
  };
}

type FieldRow = {
  id: string;
  document_id: string;
  page_index: number;
  field_type: string;
  x_pt: number;
  y_pt: number;
  width_pt: number;
  height_pt: number;
  recipient_id: string;
};

type ValueRow = {
  field_id: string;
  recipient_id: string | null;
  value_text: string | null;
  value_image_path: string | null;
  signed_at: string | null;
  ip: string | null;
  user_agent: string | null;
};

type RecipientRow = {
  id: string;
  full_name: string;
  email: string;
  phone_e164: string | null;
  auth_method: string | null;
  routing_order: number;
  notified_at: string | null;
  viewed_at: string | null;
  completed_at: string | null;
  color_hex: string | null;
};

type AuditRow = {
  event: string;
  actor_email: string | null;
  ip: string | null;
  user_agent: string | null;
  occurred_at: string;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
  metadata_json: unknown;
};

/**
 * Draw a single field's value onto the given page. Stored coords are 0–1
 * normalised with top-left origin; pdf-lib uses bottom-left, so we flip Y.
 */
async function drawField(
  pdfDoc: PDFDocument,
  page: PDFPage,
  field: FieldRow,
  value: ValueRow | undefined,
  helv: PDFFont,
) {
  if (!value) return;
  const { width: pw, height: ph } = page.getSize();
  const x = field.x_pt * pw;
  const w = field.width_pt * pw;
  const h = field.height_pt * ph;
  const yTopDown = field.y_pt * ph;
  const y = ph - yTopDown - h;

  const isImage = field.field_type === "signature" || field.field_type === "initials";
  if (isImage && value.value_image_path) {
    const bytes = await downloadSignatureImage(value.value_image_path);
    if (!bytes) return;
    let img;
    try {
      img = await pdfDoc.embedPng(bytes);
    } catch {
      try {
        img = await pdfDoc.embedJpg(bytes);
      } catch {
        return;
      }
    }
    page.drawImage(img, { x, y, width: w, height: h });
    return;
  }

  const text = (value.value_text ?? "").trim();
  if (field.field_type === "signer_id_document") {
    if (value.value_image_path) {
      page.drawText("ID document attached — see appendix", {
        x: x + 4,
        y: y + Math.max(h / 2 - 4, 2),
        size: Math.min(h * 0.35, 9),
        font: helv,
        color: rgb(0.1, 0.4, 0.2),
        maxWidth: w - 8,
      });
    }
    return;
  }
  if (!text) return;
  if (field.field_type === "checkbox") {
    if (text === "true" || text === "1" || text.toLowerCase() === "checked") {
      page.drawText("X", {
        x: x + 2,
        y: y + 2,
        size: Math.max(h - 4, 8),
        font: helv,
        color: rgb(0, 0, 0),
      });
    }
    return;
  }
  const size = Math.min(h * 0.7, 12);
  page.drawText(text, {
    x: x + 2,
    y: y + Math.max((h - size) / 2, 1),
    size,
    font: helv,
    color: rgb(0, 0, 0),
    maxWidth: w - 4,
  });
}

async function stampVerificationFooter(
  pdfDoc: PDFDocument,
  page: PDFPage,
  verifyUrl: string,
  helv: PDFFont,
) {
  const { width: pw } = page.getSize();
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    type: "png",
    margin: 0,
    width: 96,
    errorCorrectionLevel: "M",
  });
  const qrImg = await pdfDoc.embedPng(new Uint8Array(qrPng));
  const qrSize = 56;
  const pad = 16;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pw,
    height: qrSize + pad * 2,
    color: rgb(0.97, 0.97, 0.97),
  });
  page.drawImage(qrImg, { x: pad, y: pad, width: qrSize, height: qrSize });
  page.drawText("BusAcTa Operations — Digitally sealed", {
    x: pad + qrSize + 12,
    y: pad + qrSize - 12,
    size: 9,
    font: helv,
    color: rgb(0.15, 0.15, 0.15),
  });
  page.drawText("See appended Certificate of Completion for full audit trail.", {
    x: pad + qrSize + 12,
    y: pad + qrSize - 26,
    size: 7,
    font: helv,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText(`Verify: ${verifyUrl}`, {
    x: pad + qrSize + 12,
    y: pad + qrSize - 38,
    size: 7,
    font: helv,
    color: rgb(0.35, 0.35, 0.35),
  });
}

/* ============================================================
 * Certificate of Completion — stark B/W, ESIGN/UETA grade.
 * ============================================================ */

// Pure monochrome palette. No accent colours anywhere.
const INK = rgb(0, 0, 0);
const INK_SOFT = rgb(0.333, 0.333, 0.333);
const RULE = rgb(0.733, 0.733, 0.733);
const STRIPE = rgb(0.957, 0.957, 0.957);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 48;

const LEGAL_TEXT =
  "Compliance Statement: This document is a legally binding electronic summary of events executed under the guidelines of the Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA). The cryptographic hashes contained herein verify that the underlying electronic record has remained unaltered since the final completion timestamp recorded above.";

function truncate(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return String(iso);
  }
}

function geoLine(a: {
  geo_city: string | null;
  geo_region: string | null;
  geo_country: string | null;
}): string {
  const parts = [a.geo_city, a.geo_region, a.geo_country].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : "—";
}

function summariseUA(ua: string | null): string {
  if (!ua) return "—";
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";
  return os ? `${browser} / ${os}` : browser;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      line = trial;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Wrap a hex string into space-separated groups of 4, padded onto multiple lines. */
function formatHashLines(hash: string, groupsPerLine = 8): string[] {
  const groups: string[] = [];
  for (let i = 0; i < hash.length; i += 4) groups.push(hash.slice(i, i + 4));
  const lines: string[] = [];
  for (let i = 0; i < groups.length; i += groupsPerLine) {
    lines.push(groups.slice(i, i + groupsPerLine).join(" "));
  }
  return lines;
}

/** Footer with page number + (optional) legal disclaimer block. */
function drawPageChrome(
  page: PDFPage,
  helv: PDFFont,
  helvItalic: PDFFont,
  pageNo: number,
  pageTotalLabel: string,
  envelopeId: string,
  withLegal: boolean,
) {
  // Thin top rule reinforcing baseline.
  page.drawLine({
    start: { x: MARGIN, y: 32 },
    end: { x: PAGE_W - MARGIN, y: 32 },
    thickness: 0.4,
    color: RULE,
  });
  page.drawText(`Envelope ${envelopeId}`, {
    x: MARGIN,
    y: 20,
    size: 7,
    font: helv,
    color: INK_SOFT,
  });
  page.drawText(`Page ${pageNo}${pageTotalLabel}`, {
    x: PAGE_W - MARGIN - 60,
    y: 20,
    size: 7,
    font: helv,
    color: INK_SOFT,
  });
  if (withLegal) {
    const innerW = PAGE_W - MARGIN * 2;
    const lines = wrapText(LEGAL_TEXT, helvItalic, 7.5, innerW);
    let ly = 48 + (lines.length - 1) * 10;
    for (const ln of lines) {
      page.drawText(ln, {
        x: MARGIN,
        y: ly,
        size: 7.5,
        font: helvItalic,
        color: INK,
      });
      ly -= 10;
    }
  }
}

type CertContext = {
  doc: PDFDocument;
  helv: PDFFont;
  helvBold: PDFFont;
  helvItalic: PDFFont;
  courier: PDFFont;
  envelopeId: string;
  pages: PDFPage[];
};

function newCertPage(ctx: CertContext): PDFPage {
  const p = ctx.doc.addPage([PAGE_W, PAGE_H]);
  p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: WHITE });
  ctx.pages.push(p);
  return p;
}

async function drawCoverPage(
  ctx: CertContext,
  opts: {
    envelopeTitle: string;
    envelopeId: string;
    sha256: string;
    bytesHashed: number;
    verifyUrl: string;
    verifySlug: string;
    sealedAt: string;
  },
) {
  const page = newCertPage(ctx);

  // Wordmark / system stripe
  page.drawText("BUSACTA ONE  /  E-SIGNATURE", {
    x: MARGIN,
    y: PAGE_H - MARGIN,
    size: 8,
    font: ctx.helvBold,
    color: INK,
  });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - MARGIN - 6 },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - 6 },
    thickness: 0.8,
    color: INK,
  });

  // Title
  page.drawText("CERTIFICATE OF COMPLETION", {
    x: MARGIN,
    y: PAGE_H - MARGIN - 48,
    size: 26,
    font: ctx.helvBold,
    color: INK,
  });
  // Envelope title
  const titleLines = wrapText(opts.envelopeTitle, ctx.helv, 12, PAGE_W - MARGIN * 2 - 140);
  let ty = PAGE_H - MARGIN - 72;
  for (const ln of titleLines.slice(0, 2)) {
    page.drawText(ln, { x: MARGIN, y: ty, size: 12, font: ctx.helv, color: INK_SOFT });
    ty -= 14;
  }

  // QR (top-right)
  const qrPng = await QRCode.toBuffer(opts.verifyUrl || opts.verifySlug, {
    type: "png",
    margin: 0,
    width: 256,
    errorCorrectionLevel: "M",
  });
  const qrImg = await ctx.doc.embedPng(new Uint8Array(qrPng));
  const qrSize = 110;
  const qrX = PAGE_W - MARGIN - qrSize;
  const qrY = PAGE_H - MARGIN - 56 - qrSize + 14;
  page.drawRectangle({
    x: qrX - 4,
    y: qrY - 4,
    width: qrSize + 8,
    height: qrSize + 8,
    borderColor: INK,
    borderWidth: 0.6,
  });
  page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  page.drawText("Scan to verify", {
    x: qrX,
    y: qrY - 12,
    size: 8,
    font: ctx.helv,
    color: INK_SOFT,
  });

  // Metadata grid
  let y = ty - 24;
  const metaRow = (label: string, value: string, mono = false) => {
    page.drawText(label.toUpperCase(), {
      x: MARGIN,
      y,
      size: 7.5,
      font: ctx.helvBold,
      color: INK_SOFT,
    });
    page.drawText(value, {
      x: MARGIN + 110,
      y,
      size: 9,
      font: mono ? ctx.courier : ctx.helv,
      color: INK,
      maxWidth: PAGE_W - MARGIN * 2 - 110 - qrSize - 16,
    });
    y -= 14;
  };
  metaRow("Envelope ID", opts.envelopeId, true);
  metaRow("Execution Status", "COMPLETED");
  metaRow("Sealed (UTC)", fmtTs(opts.sealedAt));
  metaRow("Verification URL", opts.verifyUrl || "(slug-only)");
  metaRow("Verify Slug", opts.verifySlug, true);

  // Cryptographic checksum lockbox
  y -= 12;
  const lockboxTop = y;
  const lockboxH = 92;
  const lockboxY = y - lockboxH;
  page.drawRectangle({
    x: MARGIN,
    y: lockboxY,
    width: PAGE_W - MARGIN * 2,
    height: lockboxH,
    color: STRIPE,
    borderColor: RULE,
    borderWidth: 0.6,
  });
  page.drawText("CRYPTOGRAPHIC CHECKSUM", {
    x: MARGIN + 12,
    y: lockboxTop - 16,
    size: 8,
    font: ctx.helvBold,
    color: INK,
  });
  page.drawText("SHA-256 (RFC 6234)", {
    x: MARGIN + 12,
    y: lockboxTop - 28,
    size: 7,
    font: ctx.helv,
    color: INK_SOFT,
  });
  // Hash — monospace, two lines of 8 groups of 4 hex chars each.
  const hashLines = formatHashLines(opts.sha256, 8);
  let hy = lockboxTop - 44;
  for (const ln of hashLines) {
    page.drawText(ln, {
      x: MARGIN + 12,
      y: hy,
      size: 10,
      font: ctx.courier,
      color: INK,
    });
    hy -= 13;
  }
  page.drawText(
    `Algorithm: SHA-256   ·   Bytes hashed: ${opts.bytesHashed.toLocaleString()}   ·   Coverage: contract + ID appendix`,
    {
      x: MARGIN + 12,
      y: lockboxY + 10,
      size: 7.5,
      font: ctx.helv,
      color: INK_SOFT,
    },
  );

  drawPageChrome(page, ctx.helv, ctx.helvItalic, ctx.pages.length, "", opts.envelopeId, true);
}

async function drawSignerCard(
  ctx: CertContext,
  page: PDFPage,
  topY: number,
  signer: {
    index: number;
    total: number;
    recipient: RecipientRow;
    primaryValue: ValueRow | undefined;
    signatureBytes: Uint8Array | null;
  },
): Promise<number> {
  const cardX = MARGIN;
  const cardW = PAGE_W - MARGIN * 2;
  const cardH = 168;
  const cardY = topY - cardH;

  // Outer border
  page.drawRectangle({
    x: cardX,
    y: cardY,
    width: cardW,
    height: cardH,
    borderColor: INK,
    borderWidth: 0.8,
  });

  // Header band
  page.drawRectangle({
    x: cardX,
    y: topY - 20,
    width: cardW,
    height: 20,
    color: INK,
  });
  page.drawText(`SIGNER ${signer.index} OF ${signer.total}`, {
    x: cardX + 12,
    y: topY - 14,
    size: 9,
    font: ctx.helvBold,
    color: WHITE,
  });
  page.drawText(`Routing order ${signer.recipient.routing_order}`, {
    x: cardX + cardW - 130,
    y: topY - 14,
    size: 9,
    font: ctx.helv,
    color: WHITE,
  });

  // Left column (identity + telemetry)
  const leftX = cardX + 12;
  const leftW = cardW * 0.62;
  const sigBoxX = cardX + leftW + 8;
  const sigBoxY = cardY + 12;
  const sigBoxW = cardW - leftW - 20;
  const sigBoxH = cardH - 40;

  // Vertical divider
  page.drawLine({
    start: { x: cardX + leftW, y: cardY + 4 },
    end: { x: cardX + leftW, y: topY - 24 },
    thickness: 0.4,
    color: RULE,
  });

  const v = signer.primaryValue;
  const rows: Array<[string, string, boolean?]> = [
    ["Full name", signer.recipient.full_name],
    ["Email", `${signer.recipient.email} (verified)`],
    ["Phone", signer.recipient.phone_e164 || "—"],
    ["Auth level", authLabel(signer.recipient.auth_method)],
    ["Sent (UTC)", fmtTs(signer.recipient.notified_at)],
    ["Viewed (UTC)", fmtTs(signer.recipient.viewed_at)],
    ["Signed (UTC)", fmtTs(v?.signed_at ?? signer.recipient.completed_at)],
    ["Signing IP", v?.ip || "—", true],
    ["User agent", summariseUA(v?.user_agent ?? null)],
  ];
  let ry = topY - 36;
  for (const [label, value, mono] of rows) {
    page.drawText(label.toUpperCase(), {
      x: leftX,
      y: ry,
      size: 6.8,
      font: ctx.helvBold,
      color: INK_SOFT,
    });
    page.drawText(truncate(value, 72), {
      x: leftX + 78,
      y: ry,
      size: 8.5,
      font: mono ? ctx.courier : ctx.helv,
      color: INK,
      maxWidth: leftW - 88,
    });
    ry -= 13;
  }

  // Signature asset window
  page.drawRectangle({
    x: sigBoxX,
    y: sigBoxY,
    width: sigBoxW,
    height: sigBoxH,
    borderColor: RULE,
    borderWidth: 0.5,
  });
  page.drawText("ADOPTED SIGNATURE", {
    x: sigBoxX + 6,
    y: sigBoxY + sigBoxH - 12,
    size: 6.8,
    font: ctx.helvBold,
    color: INK_SOFT,
  });

  if (signer.signatureBytes) {
    let img;
    try {
      img = await ctx.doc.embedPng(signer.signatureBytes);
    } catch {
      try {
        img = await ctx.doc.embedJpg(signer.signatureBytes);
      } catch {
        img = null;
      }
    }
    if (img) {
      const padInner = 10;
      const innerW = sigBoxW - padInner * 2;
      const innerH = sigBoxH - 24;
      const scale = Math.min(innerW / img.width, innerH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      page.drawImage(img, {
        x: sigBoxX + (sigBoxW - drawW) / 2,
        y: sigBoxY + 8 + (innerH - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
  } else {
    page.drawText("(no signature image on file)", {
      x: sigBoxX + 6,
      y: sigBoxY + sigBoxH / 2,
      size: 8,
      font: ctx.helv,
      color: INK_SOFT,
    });
  }

  return cardY - 14; // next top
}

function authLabel(method: string | null): string {
  switch (method) {
    case "email_link":
      return "Email Verified";
    case "sms_otp":
      return "SMS One-Time Passcode";
    case "access_code":
      return "Shared Access Code";
    default:
      return "Email Verified";
  }
}

function drawSectionHeader(page: PDFPage, ctx: CertContext, y: number, label: string): number {
  page.drawText(label, {
    x: MARGIN,
    y,
    size: 14,
    font: ctx.helvBold,
    color: INK,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - 5 },
    end: { x: PAGE_W - MARGIN, y: y - 5 },
    thickness: 0.6,
    color: INK,
  });
  return y - 22;
}

async function drawSignerLedgerPages(
  ctx: CertContext,
  recipients: RecipientRow[],
  primaryValueByRecipient: Map<string, ValueRow>,
  signatureBytesByRecipient: Map<string, Uint8Array | null>,
  envelopeId: string,
) {
  if (recipients.length === 0) return;
  let page = newCertPage(ctx);
  let y = PAGE_H - MARGIN;
  y = drawSectionHeader(page, ctx, y, "SIGNER LEDGER");

  for (let i = 0; i < recipients.length; i++) {
    if (y - 168 < 70) {
      drawPageChrome(page, ctx.helv, ctx.helvItalic, ctx.pages.length, "", envelopeId, false);
      page = newCertPage(ctx);
      y = PAGE_H - MARGIN;
      y = drawSectionHeader(page, ctx, y, "SIGNER LEDGER (cont.)");
    }
    const r = recipients[i];
    y = await drawSignerCard(ctx, page, y, {
      index: i + 1,
      total: recipients.length,
      recipient: r,
      primaryValue: primaryValueByRecipient.get(r.id),
      signatureBytes: signatureBytesByRecipient.get(r.id) ?? null,
    });
  }
  drawPageChrome(page, ctx.helv, ctx.helvItalic, ctx.pages.length, "", envelopeId, false);
}

function drawAuditTablePages(
  ctx: CertContext,
  audit: AuditRow[],
  envelopeId: string,
  totalSignerCards: number,
) {
  void totalSignerCards;
  let page = newCertPage(ctx);
  let y = PAGE_H - MARGIN;
  y = drawSectionHeader(page, ctx, y, "COMPREHENSIVE AUDIT TRAIL");
  page.drawText(`${audit.length} chronological event(s).`, {
    x: MARGIN,
    y,
    size: 8,
    font: ctx.helv,
    color: INK_SOFT,
  });
  y -= 18;

  const cols = {
    ts: MARGIN,
    event: MARGIN + 110,
    actor: MARGIN + 240,
    ip: MARGIN + 360,
    details: MARGIN + 430,
  };
  const colW = {
    ts: 105,
    event: 125,
    actor: 115,
    ip: 65,
    details: PAGE_W - MARGIN - cols.details,
  };

  const drawHeader = () => {
    page.drawRectangle({
      x: MARGIN - 2,
      y: y - 4,
      width: PAGE_W - MARGIN * 2 + 4,
      height: 14,
      color: INK,
    });
    page.drawText("TIMESTAMP (UTC)", { x: cols.ts, y, size: 7, font: ctx.helvBold, color: WHITE });
    page.drawText("EVENT TYPE", { x: cols.event, y, size: 7, font: ctx.helvBold, color: WHITE });
    page.drawText("ACTOR", { x: cols.actor, y, size: 7, font: ctx.helvBold, color: WHITE });
    page.drawText("IP", { x: cols.ip, y, size: 7, font: ctx.helvBold, color: WHITE });
    page.drawText("DETAILS / BROWSER", {
      x: cols.details,
      y,
      size: 7,
      font: ctx.helvBold,
      color: WHITE,
    });
    y -= 16;
  };
  drawHeader();

  for (let i = 0; i < audit.length; i++) {
    if (y < 70) {
      drawPageChrome(page, ctx.helv, ctx.helvItalic, ctx.pages.length, "", envelopeId, false);
      page = newCertPage(ctx);
      y = PAGE_H - MARGIN;
      y = drawSectionHeader(page, ctx, y, "COMPREHENSIVE AUDIT TRAIL (cont.)");
      y -= 4;
      drawHeader();
    }
    const a = audit[i];
    if (i % 2 === 0) {
      page.drawRectangle({
        x: MARGIN - 2,
        y: y - 3,
        width: PAGE_W - MARGIN * 2 + 4,
        height: 13,
        color: STRIPE,
      });
    }
    page.drawText(truncate(fmtTs(a.occurred_at), 22), {
      x: cols.ts,
      y,
      size: 7.5,
      font: ctx.courier,
      color: INK,
      maxWidth: colW.ts,
    });
    page.drawText(truncate(a.event, 22), {
      x: cols.event,
      y,
      size: 7.5,
      font: ctx.helvBold,
      color: INK,
      maxWidth: colW.event,
    });
    page.drawText(truncate(a.actor_email ?? "system@busacta", 22), {
      x: cols.actor,
      y,
      size: 7.5,
      font: ctx.helv,
      color: INK,
      maxWidth: colW.actor,
    });
    page.drawText(truncate(a.ip ?? "—", 16), {
      x: cols.ip,
      y,
      size: 7.5,
      font: ctx.courier,
      color: INK_SOFT,
      maxWidth: colW.ip,
    });
    const details = a.ip
      ? `${summariseUA(a.user_agent)} · ${geoLine(a)}`
      : summariseUA(a.user_agent);
    page.drawText(truncate(details, 50), {
      x: cols.details,
      y,
      size: 7.5,
      font: ctx.helv,
      color: INK_SOFT,
      maxWidth: colW.details,
    });
    y -= 13;
  }

  drawPageChrome(page, ctx.helv, ctx.helvItalic, ctx.pages.length, "", envelopeId, true);
}

async function buildCertificate(opts: {
  envelopeId: string;
  envelopeTitle: string;
  sha256: string;
  bytesHashed: number;
  verifyUrl: string;
  verifySlug: string;
  sealedAt: string;
  recipients: RecipientRow[];
  primaryValueByRecipient: Map<string, ValueRow>;
  signatureBytesByRecipient: Map<string, Uint8Array | null>;
  audit: AuditRow[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const courier = await doc.embedFont(StandardFonts.Courier);

  const ctx: CertContext = {
    doc,
    helv,
    helvBold,
    helvItalic,
    courier,
    envelopeId: opts.envelopeId,
    pages: [],
  };

  await drawCoverPage(ctx, {
    envelopeTitle: opts.envelopeTitle,
    envelopeId: opts.envelopeId,
    sha256: opts.sha256,
    bytesHashed: opts.bytesHashed,
    verifyUrl: opts.verifyUrl,
    verifySlug: opts.verifySlug,
    sealedAt: opts.sealedAt,
  });

  await drawSignerLedgerPages(
    ctx,
    opts.recipients,
    opts.primaryValueByRecipient,
    opts.signatureBytesByRecipient,
    opts.envelopeId,
  );

  drawAuditTablePages(ctx, opts.audit, opts.envelopeId, opts.recipients.length);

  return doc.save();
}

/* ============================================================
 * Verification URL helper.
 * ============================================================ */

function inferOrigin(): string {
  const explicit = process.env.PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN;
  if (explicit) return explicit.replace(/\/$/, "");
  return "";
}

/* ============================================================
 * Main entry — seal envelope.
 * ============================================================ */

export async function sealEnvelope(envelopeId: string): Promise<{
  ok: true;
  slug: string;
  sha256: string;
  sealed_path: string;
  certificate_path: string;
}> {
  // Idempotency: if already sealed, return existing record.
  const { data: existing } = await supabaseAdmin
    .from("esign_completed_documents")
    .select("verification_slug, sha256_hex, sealed_pdf_path, certificate_pdf_path")
    .eq("envelope_id", envelopeId)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      slug: existing.verification_slug,
      sha256: existing.sha256_hex,
      sealed_path: existing.sealed_pdf_path,
      certificate_path: existing.certificate_pdf_path,
    };
  }

  const [envRes, docsRes, fieldsRes, valuesRes, rcpRes, auditRes] = await Promise.all([
    supabaseAdmin.from("esign_envelopes").select("id, title").eq("id", envelopeId).single(),
    supabaseAdmin
      .from("esign_documents")
      .select("id, name, order_index, source_path")
      .eq("envelope_id", envelopeId)
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("esign_fields")
      .select(
        "id, document_id, page_index, field_type, x_pt, y_pt, width_pt, height_pt, recipient_id",
      )
      .eq("envelope_id", envelopeId),
    supabaseAdmin
      .from("esign_field_values")
      .select("field_id, recipient_id, value_text, value_image_path, signed_at, ip, user_agent")
      .eq("envelope_id", envelopeId),
    supabaseAdmin
      .from("esign_recipients")
      .select(
        "id, full_name, email, phone_e164, auth_method, routing_order, notified_at, viewed_at, completed_at, color_hex",
      )
      .eq("envelope_id", envelopeId)
      .order("routing_order", { ascending: true }),
    supabaseAdmin
      .from("esign_audit_log")
      .select(
        "event, actor_email, ip, user_agent, occurred_at, geo_country, geo_region, geo_city, metadata_json",
      )
      .eq("envelope_id", envelopeId)
      .order("occurred_at", { ascending: true }),
  ]);
  if (envRes.error || !envRes.data) throw new Error(envRes.error?.message ?? "Envelope missing");
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (fieldsRes.error) throw new Error(fieldsRes.error.message);
  if (valuesRes.error) throw new Error(valuesRes.error.message);
  if (rcpRes.error) throw new Error(rcpRes.error.message);
  if (auditRes.error) throw new Error(auditRes.error.message);

  const docs = docsRes.data ?? [];
  if (docs.length === 0) throw new Error("Envelope has no documents to seal");

  const allValues = (valuesRes.data ?? []) as ValueRow[];
  const valuesByField = new Map(allValues.map((v) => [v.field_id, v]));
  const fieldsByDoc = new Map<string, FieldRow[]>();
  const allFields = (fieldsRes.data ?? []) as FieldRow[];
  for (const f of allFields) {
    const arr = fieldsByDoc.get(f.document_id) ?? [];
    arr.push(f);
    fieldsByDoc.set(f.document_id, arr);
  }

  // Merge source PDFs into the sealed base PDF, drawing fields.
  const sealed = await PDFDocument.create();
  const helv = await sealed.embedFont(StandardFonts.Helvetica);

  for (const d of docs) {
    const srcBytes = await downloadPdf(d.source_path);
    const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const pageIndices = src.getPageIndices();
    const copied = await sealed.copyPages(src, pageIndices);
    const docFields = fieldsByDoc.get(d.id) ?? [];
    for (let i = 0; i < copied.length; i++) {
      const page = sealed.addPage(copied[i]);
      const onThisPage = docFields.filter((f) => f.page_index === i);
      for (const f of onThisPage) {
        await drawField(sealed, page, f, valuesByField.get(f.id), helv);
      }
    }
  }

  // ID-document appendix.
  const idFields = allFields.filter((f) => f.field_type === "signer_id_document");
  const recipients = (rcpRes.data ?? []) as RecipientRow[];
  const recipientById = new Map(recipients.map((r) => [r.id, r] as const));

  // Denormalize signing telemetry (IP / UA / geo) onto esign_recipients so the
  // certificate ledger can render each signer's context without re-querying
  // esign_field_values. Picks the latest signed_at value per recipient.
  try {
    const auditByRcp = new Map<
      string,
      { geo_country: string | null; geo_region: string | null; geo_city: string | null }
    >();
    for (const a of auditRes.data ?? []) {
      const meta = (a as { metadata_json?: Record<string, unknown> | null }).metadata_json ?? null;
      const rcpId = meta && typeof meta.recipient_id === "string" ? meta.recipient_id : null;
      if (!rcpId) continue;
      const existing = auditByRcp.get(rcpId);
      auditByRcp.set(rcpId, {
        geo_country:
          (a as { geo_country: string | null }).geo_country ?? existing?.geo_country ?? null,
        geo_region: (a as { geo_region: string | null }).geo_region ?? existing?.geo_region ?? null,
        geo_city: (a as { geo_city: string | null }).geo_city ?? existing?.geo_city ?? null,
      });
    }
    const latestByRcp = new Map<
      string,
      { ip: string | null; ua: string | null; signed_at: string | null }
    >();
    for (const v of allValues) {
      if (!v.recipient_id || !v.signed_at) continue;
      const cur = latestByRcp.get(v.recipient_id);
      if (!cur || (cur.signed_at && v.signed_at > cur.signed_at)) {
        latestByRcp.set(v.recipient_id, {
          ip: v.ip ?? null,
          ua: v.user_agent ?? null,
          signed_at: v.signed_at,
        });
      }
    }
    for (const r of recipients) {
      const tel = latestByRcp.get(r.id);
      const geo = auditByRcp.get(r.id);
      if (!tel && !geo) continue;
      const patch: Record<string, string | null> = {};
      if (tel?.ip) patch.signing_ip = tel.ip;
      if (tel?.ua) patch.signing_user_agent = tel.ua;
      if (geo?.geo_country) patch.signing_geo_country = geo.geo_country;
      if (geo?.geo_region) patch.signing_geo_region = geo.geo_region;
      if (geo?.geo_city) patch.signing_geo_city = geo.geo_city;
      if (Object.keys(patch).length === 0) continue;
      await supabaseAdmin
        .from("esign_recipients")
        .update(patch as never)
        .eq("id", r.id);
      Object.assign(r as Record<string, unknown>, patch);
    }
  } catch (e) {
    console.warn("[esign/seal] recipient telemetry denorm failed (non-fatal):", e);
  }

  type IdAttachment = {
    field: FieldRow;
    bytes: Uint8Array;
    mime: string;
    recipient: RecipientRow | undefined;
  };
  const idAttachments: IdAttachment[] = [];
  for (const f of idFields) {
    const v = valuesByField.get(f.id);
    if (!v?.value_image_path) continue;
    const dl = await downloadIdDoc(v.value_image_path);
    if (!dl) continue;
    idAttachments.push({
      field: f,
      bytes: dl.bytes,
      mime: dl.mime,
      recipient: recipientById.get(f.recipient_id),
    });
  }
  const idAppendixIncluded = idAttachments.length > 0;
  if (idAppendixIncluded) {
    const cover = sealed.addPage([612, 792]);
    const { width: cw, height: ch } = cover.getSize();
    cover.drawText("ID Document Appendix", {
      x: 48,
      y: ch - 96,
      size: 24,
      font: helv,
      color: INK,
    });
    cover.drawText(
      `${idAttachments.length} government-ID upload${idAttachments.length === 1 ? "" : "s"} collected during signing.`,
      {
        x: 48,
        y: ch - 124,
        size: 11,
        font: helv,
        color: INK_SOFT,
        maxWidth: cw - 96,
      },
    );
    let ly = ch - 160;
    for (const a of idAttachments) {
      const label = `• ${a.recipient?.full_name ?? "Unknown signer"} — ${a.recipient?.email ?? ""}`;
      cover.drawText(label, {
        x: 48,
        y: ly,
        size: 10,
        font: helv,
        color: INK,
        maxWidth: cw - 96,
      });
      ly -= 14;
      if (ly < 60) break;
    }

    for (const a of idAttachments) {
      const headerText = `ID Upload — ${a.recipient?.full_name ?? "Signer"} (${a.recipient?.email ?? ""})`;
      if (a.mime.includes("pdf")) {
        try {
          const src = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
          const copied = await sealed.copyPages(src, src.getPageIndices());
          for (const p of copied) {
            const added = sealed.addPage(p);
            const { width: pw, height: ph } = added.getSize();
            added.drawRectangle({
              x: 0,
              y: ph - 18,
              width: pw,
              height: 18,
              color: STRIPE,
            });
            added.drawText(headerText, {
              x: 12,
              y: ph - 13,
              size: 8,
              font: helv,
              color: INK,
              maxWidth: pw - 24,
            });
          }
        } catch (err) {
          console.error("[esign:seal] failed to embed ID PDF", err);
        }
      } else {
        let img;
        try {
          img = a.mime.includes("png")
            ? await sealed.embedPng(a.bytes)
            : await sealed.embedJpg(a.bytes);
        } catch (err) {
          console.error("[esign:seal] failed to embed ID image", err);
          continue;
        }
        const page = sealed.addPage([612, 792]);
        const { width: pw, height: ph } = page.getSize();
        const headerH = 22;
        page.drawRectangle({
          x: 0,
          y: ph - headerH,
          width: pw,
          height: headerH,
          color: STRIPE,
        });
        page.drawText(headerText, {
          x: 12,
          y: ph - 15,
          size: 9,
          font: helv,
          color: INK,
          maxWidth: pw - 24,
        });
        const padX = 36;
        const padTop = headerH + 18;
        const padBottom = 24;
        const boxW = pw - padX * 2;
        const boxH = ph - padTop - padBottom;
        const scale = Math.min(boxW / img.width, boxH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        page.drawImage(img, {
          x: (pw - drawW) / 2,
          y: padBottom + (boxH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }
    }
  }

  // Stamp QR + verification footer on the final contract/appendix page.
  const slug = newSlug();
  const verifyPath = `${VERIFY_PATH}/${slug}`;
  const origin = inferOrigin();
  const verifyUrl = origin ? `${origin}${verifyPath}` : verifyPath;
  const basePages = sealed.getPages();
  const lastBasePage = basePages[basePages.length - 1];
  await stampVerificationFooter(sealed, lastBasePage, verifyUrl, helv);

  // Save base bytes -> hash covers contract + ID appendix only.
  const baseBytes = await sealed.save();
  const sha256 = createHash("sha256").update(baseBytes).digest("hex");
  const bytesHashed = baseBytes.length;
  const sealedAt = new Date().toISOString();

  // Derive primary value per recipient (latest signed_at on a signature field
  // if present, otherwise latest signed value overall). Used for ledger card
  // IP/UA/timestamp.
  const sigFieldIds = new Set(
    allFields.filter((f) => f.field_type === "signature").map((f) => f.id),
  );
  const primaryValueByRecipient = new Map<string, ValueRow>();
  for (const v of allValues) {
    if (!v.recipient_id) continue;
    const cur = primaryValueByRecipient.get(v.recipient_id);
    const isSig = sigFieldIds.has(v.field_id);
    const curIsSig = cur ? sigFieldIds.has(cur.field_id) : false;
    if (!cur) {
      primaryValueByRecipient.set(v.recipient_id, v);
      continue;
    }
    // Prefer signature-field values over other field values.
    if (isSig && !curIsSig) {
      primaryValueByRecipient.set(v.recipient_id, v);
      continue;
    }
    if (isSig === curIsSig) {
      const tNew = v.signed_at ? Date.parse(v.signed_at) : 0;
      const tCur = cur.signed_at ? Date.parse(cur.signed_at) : 0;
      if (tNew > tCur) primaryValueByRecipient.set(v.recipient_id, v);
    }
  }

  // Fetch signature image bytes per recipient (best-effort).
  const signatureBytesByRecipient = new Map<string, Uint8Array | null>();
  for (const r of recipients) {
    // Find latest signature field value for this recipient.
    let chosen: ValueRow | undefined;
    for (const v of allValues) {
      if (v.recipient_id !== r.id) continue;
      if (!sigFieldIds.has(v.field_id)) continue;
      if (!v.value_image_path) continue;
      const tNew = v.signed_at ? Date.parse(v.signed_at) : 0;
      const tCur = chosen?.signed_at ? Date.parse(chosen.signed_at) : 0;
      if (!chosen || tNew > tCur) chosen = v;
    }
    if (chosen?.value_image_path) {
      signatureBytesByRecipient.set(r.id, await downloadSignatureImage(chosen.value_image_path));
    } else {
      signatureBytesByRecipient.set(r.id, null);
    }
  }

  const auditRows = (auditRes.data ?? []) as AuditRow[];

  // Build standalone certificate PDF with real hash + telemetry.
  const certBytes = await buildCertificate({
    envelopeId,
    envelopeTitle: envRes.data.title,
    sha256,
    bytesHashed,
    verifyUrl,
    verifySlug: slug,
    sealedAt,
    recipients,
    primaryValueByRecipient,
    signatureBytesByRecipient,
    audit: auditRows,
  });

  // Append certificate pages onto the sealed base so the final sealed.pdf
  // contains contract + ID appendix + certificate as a single download.
  const certSrc = await PDFDocument.load(certBytes, { ignoreEncryption: true });
  const certPages = await sealed.copyPages(certSrc, certSrc.getPageIndices());
  for (const p of certPages) sealed.addPage(p);
  const finalSealedBytes = await sealed.save();

  const sealedPath = `${envelopeId}/sealed.pdf`;
  const certPath = `${envelopeId}/certificate.pdf`;
  const up1 = await supabaseAdmin.storage
    .from("esign-signed")
    .upload(sealedPath, finalSealedBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (up1.error) throw new Error(`upload sealed: ${up1.error.message}`);
  const up2 = await supabaseAdmin.storage.from("esign-signed").upload(certPath, certBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up2.error) throw new Error(`upload cert: ${up2.error.message}`);

  const { error: insErr } = await supabaseAdmin.from("esign_completed_documents").insert({
    envelope_id: envelopeId,
    sealed_pdf_path: sealedPath,
    certificate_pdf_path: certPath,
    sha256_hex: sha256,
    signature_algo: "SHA-256",
    verification_slug: slug,
    signed_at: sealedAt,
    bytes_hashed: bytesHashed,
    id_appendix_included: idAppendixIncluded,
    signer_count: recipients.length,
    audit_event_count: auditRows.length,
  } as never);
  if (insErr) throw new Error(`completed_documents insert: ${insErr.message}`);

  await supabaseAdmin.from("esign_audit_log").insert({
    envelope_id: envelopeId,
    event: "certificate_generated",
    metadata_json: {
      sha256,
      slug,
      sealed_path: sealedPath,
      bytes_hashed: bytesHashed,
      signer_count: recipients.length,
      audit_event_count: auditRows.length,
      id_appendix_included: idAppendixIncluded,
    },
  });

  return { ok: true, slug, sha256, sealed_path: sealedPath, certificate_path: certPath };
}
