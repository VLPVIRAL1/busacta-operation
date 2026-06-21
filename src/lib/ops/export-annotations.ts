// Annotated copy export: flattens stored annotations onto image or PDF pages.
// Works entirely client-side using a signed URL for the source file.
import jsPDF from "jspdf";
import type { FileAnnotation } from "@/lib/ops/file-annotations.functions";

type Geometry = { x: number; y: number; w?: number; h?: number };

function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  list: FileAnnotation[],
  page: number,
) {
  let pinIndex = 0;
  for (const a of list) {
    if (a.page !== page) continue;
    pinIndex += 1;
    const g = a.geometry as Geometry;
    const color = a.color || "#fbbf24";
    if (a.kind === "rect") {
      const x = (g.x ?? 0) * width;
      const y = (g.y ?? 0) * height;
      const w = (g.w ?? 0) * width;
      const h = (g.h ?? 0) * height;
      ctx.fillStyle = `${color}33`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      if (a.body) {
        ctx.fillStyle = "#111827";
        ctx.font = "12px sans-serif";
        ctx.fillText(a.body.slice(0, 80), x + 4, y + 14);
      }
    } else {
      const cx = (g.x ?? 0) * width;
      const cy = (g.y ?? 0) * height;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#1f2937";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(pinIndex), cx, cy);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      if (a.body) {
        ctx.fillStyle = "#111827";
        ctx.font = "12px sans-serif";
        ctx.fillText(a.body.slice(0, 80), cx + 16, cy + 4);
      }
    }
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${String(e)}`));
    img.src = url;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export async function exportAnnotatedImage(
  url: string,
  filename: string,
  annotations: FileAnnotation[],
) {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0);
  drawAnnotations(ctx, canvas.width, canvas.height, annotations, 1);
  await new Promise<void>((resolve) =>
    canvas.toBlob((b) => {
      if (b) {
        const base = filename.replace(/\.[^.]+$/, "");
        downloadBlob(b, `${base} (annotated).png`);
      }
      resolve();
    }, "image/png"),
  );
}

export async function exportAnnotatedPdf(
  url: string,
  filename: string,
  annotations: FileAnnotation[],
) {
  const { pdfjs } = await import("@/lib/pdf/pdf-worker");
  const loadingTask = pdfjs.getDocument({ url, withCredentials: false });
  const doc = await loadingTask.promise;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  let first = true;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    drawAnnotations(ctx, canvas.width, canvas.height, annotations, p);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    if (!first) pdf.addPage();
    pdf.addImage(dataUrl, "JPEG", (pdfW - w) / 2, (pdfH - h) / 2, w, h);
    first = false;
  }
  const blob = pdf.output("blob");
  const base = filename.replace(/\.[^.]+$/, "");
  downloadBlob(blob, `${base} (annotated).pdf`);
}
