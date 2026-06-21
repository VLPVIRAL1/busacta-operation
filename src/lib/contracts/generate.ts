/**
 * Contract document generation — merge a Contract Profile's data into a
 * template's Tiptap JSON body, then download as .docx or PDF.
 *
 * Reuses the Daily Notes exporters (exportDocx / exportPdf) so headings, lists,
 * tables and marks render identically. Merge fields are substituted directly
 * into the structured JSON's text nodes, so both outputs share one merge pass
 * and the HTML/docx layers handle their own escaping.
 */
import { exportDocx, exportPdf } from "@/lib/global-dashboard/note-export";
import { substituteMergeFieldsText } from "./merge-fields";

type TiptapNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

/** Deep-copy the doc, substituting {{tokens}} inside every text node. */
export function mergeIntoDoc(
  bodyJson: Record<string, unknown>,
  data: Record<string, string>,
): Record<string, unknown> {
  function walk(node: TiptapNode): TiptapNode {
    const next: TiptapNode = { ...node };
    if (node.type === "text" && typeof node.text === "string") {
      next.text = substituteMergeFieldsText(node.text, data);
    }
    if (Array.isArray(node.content)) {
      next.content = node.content.map(walk);
    }
    return next;
  }
  return walk((bodyJson ?? {}) as TiptapNode) as Record<string, unknown>;
}

/** Generate and download a merged .docx file. */
export async function generateDocx(
  bodyJson: Record<string, unknown>,
  data: Record<string, string>,
  title: string,
): Promise<void> {
  await exportDocx(mergeIntoDoc(bodyJson, data), title);
}

/** Generate a merged PDF via the browser print dialog ("Save as PDF"). */
export function generatePdf(
  bodyJson: Record<string, unknown>,
  data: Record<string, string>,
  title: string,
): void {
  exportPdf(mergeIntoDoc(bodyJson, data), title);
}
