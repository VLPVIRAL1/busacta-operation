/**
 * Export helpers for Daily Notes â€” render the Tiptap JSON doc into
 * Markdown, a printable HTML/PDF document, or a .docx file.
 *
 * Markdown and HTML render every common node we use (headings, lists,
 * checklists, tables, callouts, toggles, links, basic marks). Unknown
 * nodes degrade to their text content.
 */

type Node = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

// ---------------- Markdown ----------------

function markText(n: Node): string {
  let t = n.text ?? "";
  if (!n.marks) return t;
  for (const m of n.marks) {
    if (m.type === "bold") t = `**${t}**`;
    else if (m.type === "italic") t = `*${t}*`;
    else if (m.type === "strike") t = `~~${t}~~`;
    else if (m.type === "code") t = `\`${t}\``;
    else if (m.type === "link") {
      const href = (m.attrs?.href as string) ?? "";
      t = `[${t}](${href})`;
    }
  }
  return t;
}

function inlineMd(nodes: Node[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((c) => {
      if (c.type === "text") return markText(c);
      if (c.type === "hardBreak") return "  \n";
      if (c.type === "mention")
        return `@${(c.attrs?.label as string) ?? (c.attrs?.id as string) ?? ""}`;
      if (c.type === "taskMention")
        return `#${(c.attrs?.label as string) ?? (c.attrs?.id as string) ?? ""}`;
      return inlineMd(c.content);
    })
    .join("");
}

function blockMd(n: Node, depth = 0): string {
  const pad = "  ".repeat(depth);
  switch (n.type) {
    case "paragraph":
      return pad + inlineMd(n.content) + "\n";
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1));
      return "#".repeat(level) + " " + inlineMd(n.content) + "\n";
    }
    case "bulletList":
      return (n.content ?? [])
        .map(
          (li) => `${pad}- ${inlineMd(li.content?.[0]?.content)}\n${childrenMd(li, depth + 1, 1)}`,
        )
        .join("");
    case "orderedList":
      return (n.content ?? [])
        .map(
          (li, i) =>
            `${pad}${i + 1}. ${inlineMd(li.content?.[0]?.content)}\n${childrenMd(li, depth + 1, 1)}`,
        )
        .join("");
    case "taskList":
      return (n.content ?? [])
        .map((li) => {
          const checked = (li.attrs?.checked as boolean) ? "x" : " ";
          return `${pad}- [${checked}] ${inlineMd(li.content?.[0]?.content)}\n${childrenMd(li, depth + 1, 1)}`;
        })
        .join("");
    case "blockquote":
      return (n.content ?? []).map((c) => `> ${blockMd(c, depth).trimEnd()}\n`).join("");
    case "horizontalRule":
      return "\n---\n\n";
    case "codeBlock":
      return "```\n" + (n.content?.[0]?.text ?? "") + "\n```\n";
    case "calloutBlock": {
      const v = (n.attrs?.variant as string) ?? "info";
      const inner = (n.content ?? []).map((c) => blockMd(c, depth)).join("");
      return `> **${v.toUpperCase()}**\n${inner.replace(/^/gm, "> ")}\n`;
    }
    case "toggleBlock": {
      const summary = (n.attrs?.summary as string) ?? "Details";
      const inner = (n.content ?? []).map((c) => blockMd(c, depth)).join("");
      return `<details><summary>${summary}</summary>\n\n${inner}\n</details>\n`;
    }
    case "table":
      return tableMd(n) + "\n";
    case "image": {
      const src = (n.attrs?.src as string) ?? "";
      const alt = (n.attrs?.alt as string) ?? "";
      return `![${alt}](${src})\n`;
    }
    default:
      return (n.content ?? []).map((c) => blockMd(c, depth)).join("");
  }
}

function childrenMd(li: Node, depth: number, skipFirst: number): string {
  return (li.content ?? [])
    .slice(skipFirst)
    .map((c) => blockMd(c, depth))
    .join("");
}

function tableMd(t: Node): string {
  const rows = t.content ?? [];
  if (rows.length === 0) return "";
  const cells = rows.map((r) =>
    (r.content ?? []).map((c) => inlineMd(c.content?.[0]?.content).trim()),
  );
  const cols = cells[0]?.length ?? 0;
  const header = `| ${cells[0].join(" | ")} |`;
  const sep = `| ${Array(cols).fill("---").join(" | ")} |`;
  const body = cells
    .slice(1)
    .map((r) => `| ${r.join(" | ")} |`)
    .join("\n");
  return [header, sep, body].filter(Boolean).join("\n");
}

export function toMarkdown(doc: unknown, title: string): string {
  const root = doc as Node;
  const body = (root?.content ?? []).map((c) => blockMd(c)).join("\n");
  return `# ${title}\n\n${body}`.trim() + "\n";
}

// ---------------- HTML (used by PDF print) ----------------

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;",
  );
}

function markHtml(n: Node): string {
  let t = escape(n.text ?? "");
  if (!n.marks) return t;
  for (const m of n.marks) {
    if (m.type === "bold") t = `<strong>${t}</strong>`;
    else if (m.type === "italic") t = `<em>${t}</em>`;
    else if (m.type === "underline") t = `<u>${t}</u>`;
    else if (m.type === "strike") t = `<s>${t}</s>`;
    else if (m.type === "code") t = `<code>${t}</code>`;
    else if (m.type === "highlight") {
      const color = (m.attrs?.color as string) ?? "yellow";
      t = `<mark style="background:${escape(color)}">${t}</mark>`;
    } else if (m.type === "textStyle") {
      const color = m.attrs?.color as string | undefined;
      if (color) t = `<span style="color:${escape(color)}">${t}</span>`;
    } else if (m.type === "link") {
      const href = (m.attrs?.href as string) ?? "#";
      t = `<a href="${escape(href)}">${t}</a>`;
    }
  }
  return t;
}

function inlineHtml(nodes: Node[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((c) => {
      if (c.type === "text") return markHtml(c);
      if (c.type === "hardBreak") return "<br />";
      if (c.type === "mention")
        return `<span class="mention">@${escape((c.attrs?.label as string) ?? "")}</span>`;
      if (c.type === "taskMention")
        return `<span class="task">#${escape((c.attrs?.label as string) ?? "")}</span>`;
      return inlineHtml(c.content);
    })
    .join("");
}

function blockHtml(n: Node): string {
  switch (n.type) {
    case "paragraph": {
      const align = (n.attrs?.textAlign as string) ?? null;
      const style = align ? ` style="text-align:${align}"` : "";
      return `<p${style}>${inlineHtml(n.content)}</p>`;
    }
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1));
      return `<h${level}>${inlineHtml(n.content)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${(n.content ?? []).map((li) => `<li>${(li.content ?? []).map(blockHtml).join("")}</li>`).join("")}</ul>`;
    case "orderedList":
      return `<ol>${(n.content ?? []).map((li) => `<li>${(li.content ?? []).map(blockHtml).join("")}</li>`).join("")}</ol>`;
    case "taskList":
      return `<ul class="task-list">${(n.content ?? [])
        .map((li) => {
          const checked = li.attrs?.checked ? "checked" : "";
          return `<li><input type="checkbox" disabled ${checked}/> ${(li.content ?? []).map(blockHtml).join("")}</li>`;
        })
        .join("")}</ul>`;
    case "blockquote":
      return `<blockquote>${(n.content ?? []).map(blockHtml).join("")}</blockquote>`;
    case "horizontalRule":
      return "<hr />";
    case "codeBlock":
      return `<pre><code>${escape(n.content?.[0]?.text ?? "")}</code></pre>`;
    case "calloutBlock": {
      const v = (n.attrs?.variant as string) ?? "info";
      const colors: Record<string, string> = {
        info: "#e0f2fe",
        warning: "#fef3c7",
        tip: "#ede9fe",
        success: "#d1fae5",
      };
      return `<div style="background:${colors[v] ?? colors.info};border-left:4px solid #888;padding:8px 12px;margin:8px 0;border-radius:4px"><strong style="text-transform:uppercase;font-size:11px">${escape(v)}</strong>${(n.content ?? []).map(blockHtml).join("")}</div>`;
    }
    case "toggleBlock":
      return `<details open><summary><strong>${escape((n.attrs?.summary as string) ?? "Details")}</strong></summary>${(n.content ?? []).map(blockHtml).join("")}</details>`;
    case "table":
      return `<table style="border-collapse:collapse;width:100%">${(n.content ?? []).map(blockHtml).join("")}</table>`;
    case "tableRow":
      return `<tr>${(n.content ?? []).map(blockHtml).join("")}</tr>`;
    case "tableHeader":
      return `<th style="border:1px solid #ccc;padding:6px;background:#f3f4f6">${(n.content ?? []).map(blockHtml).join("")}</th>`;
    case "tableCell":
      return `<td style="border:1px solid #ccc;padding:6px">${(n.content ?? []).map(blockHtml).join("")}</td>`;
    case "image":
      return `<img src="${escape((n.attrs?.src as string) ?? "")}" alt="${escape((n.attrs?.alt as string) ?? "")}" style="max-width:100%" />`;
    default:
      return (n.content ?? []).map(blockHtml).join("");
  }
}

export function toHtml(doc: unknown, title: string): string {
  const root = doc as Node;
  const body = (root?.content ?? []).map(blockHtml).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escape(title)}</title>
<style>
  body{font-family:Aptos,Inter,system-ui,sans-serif;color:#0f172a;max-width:780px;margin:32px auto;padding:0 24px;line-height:1.6}
  h1{font-size:28px;margin:0 0 16px}
  h2{font-size:20px;margin:24px 0 8px}
  h3{font-size:16px;margin:20px 0 6px}
  table{margin:12px 0}
  blockquote{border-left:3px solid #cbd5e1;color:#475569;padding-left:12px;margin:8px 0}
  pre{background:#f1f5f9;padding:10px;border-radius:6px;overflow-x:auto}
  .mention{color:#0369a1;font-weight:500}
  .task{color:#7c3aed;font-weight:500}
</style></head>
<body><h1>${escape(title)}</h1>${body}</body></html>`;
}

// ---------------- Trigger downloads ----------------

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFile(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "_").trim() || "note";
}

export function exportMarkdown(doc: unknown, title: string): void {
  const md = toMarkdown(doc, title);
  download(`${safeFile(title)}.md`, new Blob([md], { type: "text/markdown;charset=utf-8" }));
}

/** PDF via the browser's print dialog (no extra deps; users pick "Save as PDF"). */
export function exportPdf(doc: unknown, title: string): void {
  const html = toHtml(doc, title);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the new window a beat to lay out before printing.
  setTimeout(() => {
    w.focus();
    w.print();
  }, 250);
}

/**
 * Word (.doc) export â€” emits an HTML document that Microsoft Word, Pages and
 * LibreOffice all open and render with our inlined CSS, so the downloaded file
 * looks the same as what the user sees in the Daily Notes editor.
 *
 * (Producing a true .docx with the same CSS fidelity would need a server-side
 * converter like Pandoc/LibreOffice headless.)
 */
export async function exportDocx(doc: unknown, title: string): Promise<void> {
  const html = toWordHtml(doc, title);
  // Word recognises the .doc extension + application/msword MIME with an
  // HTML payload and renders the inlined CSS faithfully.
  download(`${safeFile(title)}.doc`, new Blob([html], { type: "application/msword" }));
}

/**
 * Build an HTML document with inlined CSS tuned to mirror the on-screen
 * `.rich-content` / `.daily-notes-prose` styles (heading sizes, Aptos fonts,
 * lists, blockquotes, tables, callouts, toggles, mentions). Wrapped in the
 * Office XML namespaces Word uses to detect HTML-as-Word.
 */
export function toWordHtml(doc: unknown, title: string): string {
  const root = doc as Node;
  const body = (root?.content ?? []).map(blockHtml).join("");
  const css = `
    body{font-family:"Aptos","Inter",ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;max-width:780px;margin:32px auto;padding:0 24px}
    h1,h2,h3,h4{font-family:"Aptos Display","Aptos","Inter",sans-serif;font-weight:700;letter-spacing:-0.01em;margin:0.6em 0 0.3em;color:#0f172a}
    h1{font-size:2em;line-height:1.2}
    h2{font-size:1.55em;line-height:1.25}
    h3{font-size:1.25em;line-height:1.3}
    h4{font-size:1.05em;line-height:1.35}
    p{margin:0.25em 0}
    ul{list-style:disc;padding-left:1.5em;margin:0.3em 0}
    ol{list-style:decimal;padding-left:1.5em;margin:0.3em 0}
    ul ul{list-style:circle}ul ul ul{list-style:square}
    ol ol{list-style:lower-alpha}ol ol ol{list-style:lower-roman}
    li{margin:0.1em 0}
    li>p{margin:0}
    blockquote{border-left:3px solid #2563eb;padding:0.3em 0.8em;margin:0.6em 0;color:#475569;font-style:italic;background:#eff6ff;border-radius:0 6px 6px 0}
    code{background:#f1f5f9;padding:0.1em 0.35em;border-radius:4px;font-size:0.92em;font-family:Consolas,ui-monospace,Menlo,monospace}
    pre{background:#f1f5f9;padding:0.7em 0.9em;border-radius:6px;overflow-x:auto;margin:0.5em 0;font-family:Consolas,ui-monospace,Menlo,monospace}
    a{color:#2563eb;text-decoration:underline}
    img{max-width:100%;height:auto;border-radius:6px}
    table{border-collapse:collapse;width:100%;margin:0.5em 0}
    th,td{border:1px solid #cbd5e1;padding:6px 10px;vertical-align:top}
    th{background:#eff6ff;font-weight:600;text-align:left}
    hr{border:none;border-top:1px solid #cbd5e1;margin:1.1em 0}
    ul.task-list{list-style:none;padding-left:0.2em}
    ul.task-list li{margin:0.18em 0}
    .mention{color:#0369a1;font-weight:500}
    .task{color:#7c3aed;font-weight:500}
    .callout{border-left:4px solid #888;padding:8px 12px;margin:8px 0;border-radius:4px}
    .callout-info{background:#e0f2fe;border-left-color:#0369a1}
    .callout-warning{background:#fef3c7;border-left-color:#d97706}
    .callout-tip{background:#ede9fe;border-left-color:#7c3aed}
    .callout-success{background:#d1fae5;border-left-color:#059669}
    .callout-label{display:block;text-transform:uppercase;font-size:11px;font-weight:700;letter-spacing:0.05em;margin-bottom:4px}
    details{margin:6px 0;padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc}
    summary{cursor:pointer;font-weight:600}
    h1.note-title{font-size:2.2em;margin-top:0;border-bottom:2px solid #e2e8f0;padding-bottom:0.2em}
  `.replace(/\s+/g, " ");
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8"/>
<title>${escape(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${css}</style>
</head>
<body>
<h1 class="note-title">${escape(title)}</h1>
${body}
</body>
</html>`;
}

