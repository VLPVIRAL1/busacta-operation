// Shared UI helpers for the File Gallery (file-type classification used by both
// the toolbar filter and the file-list type badge).
import { FileIcon, FileImage, FileSpreadsheet, FileText, type LucideIcon } from "lucide-react";

export type FileTypeKey = "pdf" | "image" | "document" | "spreadsheet" | "other";

export const FILE_TYPE_LABEL: Record<FileTypeKey, string> = {
  pdf: "PDF",
  image: "Image",
  document: "Document",
  spreadsheet: "Spreadsheet",
  other: "File",
};

export function fileTypeOf(filename: string, mime: string | null): FileTypeKey {
  const m = (mime ?? "").toLowerCase();
  const name = filename.toLowerCase();
  if (m === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|heic|tiff?)$/i.test(name)) {
    return "image";
  }
  if (/spreadsheet|excel|csv/.test(m) || /\.(xlsx?|csv|tsv|ods)$/i.test(name)) {
    return "spreadsheet";
  }
  if (
    /word|document|text|rtf|presentation|powerpoint/.test(m) ||
    /\.(docx?|txt|rtf|odt|pptx?|md)$/i.test(name)
  ) {
    return "document";
  }
  return "other";
}

export function isPreviewable(filename: string, mime: string | null): boolean {
  const t = fileTypeOf(filename, mime);
  return t === "pdf" || t === "image";
}

/** Returns the Lucide icon component and colour class for a given file. */
export function fileIconFor(
  filename: string,
  mime: string | null,
): { Icon: LucideIcon; className: string } {
  const t = fileTypeOf(filename, mime);
  switch (t) {
    case "pdf":
      return { Icon: FileText, className: "text-red-500" };
    case "image":
      return { Icon: FileImage, className: "text-blue-500" };
    case "spreadsheet":
      return { Icon: FileSpreadsheet, className: "text-emerald-600" };
    case "document":
      return { Icon: FileText, className: "text-sky-600" };
    default:
      return { Icon: FileIcon, className: "text-slate-500" };
  }
}
