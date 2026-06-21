import { format, parseISO } from "date-fns";

type TiptapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type TiptapNode = {
  type: string;
  text?: string;
  marks?: TiptapMark[];
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
};

const SAFE_LINK_SCHEMES = ["http:", "https:", "mailto:", "tel:"];
const SAFE_IMAGE_SCHEMES = ["http:", "https:", "cid:"];

function isSafeUrl(url: string): boolean {
  try {
    const scheme = new URL(url).protocol;
    return SAFE_LINK_SCHEMES.includes(scheme);
  } catch {
    return url.startsWith("#") || url.startsWith("/");
  }
}

function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!SAFE_IMAGE_SCHEMES.includes(parsed.protocol)) return false;
    if (parsed.protocol === "data:") {
      return parsed.pathname.startsWith("image/");
    }
    return true;
  } catch {
    return false;
  }
}

function applyMarks(text: string, marks: TiptapMark[]): string {
  let out = escapeHtml(text);
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "code":
        out = `<code style="font-family:monospace;background:#f3f3f3;padding:1px 4px">${out}</code>`;
        break;
      case "link": {
        const href = String(mark.attrs?.href ?? "#");
        const safeHref = isSafeUrl(href) ? href : "#";
        out = `<a href="${escapeAttr(safeHref)}">${out}</a>`;
        break;
      }
      case "highlight":
        out = `<mark>${out}</mark>`;
        break;
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function convertInline(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "text") return applyMarks(n.text ?? "", n.marks ?? []);
      if (n.type === "hardBreak") return "<br>";
      // Nested inline — recurse
      return convertInline(n.content);
    })
    .join("");
}

function convertTableRow(row: TiptapNode, isHeader: boolean): string {
  const tag = isHeader ? "th" : "td";
  const cells = (row.content ?? [])
    .map((cell) => `<${tag}>${convertNodes(cell.content ?? [])}</${tag}>`)
    .join("");
  return `<tr>${cells}</tr>`;
}

function convertNodes(nodes: TiptapNode[]): string {
  return nodes.map(convertNode).join("");
}

function convertNode(node: TiptapNode): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${convertInline(node.content)}</p>`;

    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      const tag = `h${Math.min(Math.max(level, 1), 6)}`;
      return `<${tag}>${convertInline(node.content)}</${tag}>`;
    }

    case "bulletList":
      return `<ul>${(node.content ?? []).map(convertNode).join("")}</ul>`;

    case "orderedList":
      return `<ol>${(node.content ?? []).map(convertNode).join("")}</ol>`;

    case "listItem":
      return `<li>${convertNodes(node.content ?? [])}</li>`;

    case "taskList":
      return `<ul style="list-style:none;padding-left:0">${(node.content ?? []).map(convertNode).join("")}</ul>`;

    case "taskItem": {
      const checked = node.attrs?.checked === true;
      const checkbox = `<input type="checkbox"${checked ? " checked" : ""} disabled style="margin-right:6px">`;
      return `<li>${checkbox}${convertNodes(node.content ?? [])}</li>`;
    }

    case "blockquote":
      return `<div style="border-left:3px solid #ccc;padding-left:12px;color:#555;margin:8px 0">${convertNodes(node.content ?? [])}</div>`;

    case "codeBlock": {
      const lang = String(node.attrs?.language ?? "");
      const code = (node.content ?? []).map((n) => escapeHtml(n.text ?? "")).join("");
      return `<pre style="font-family:monospace;background:#f3f3f3;padding:8px;border-radius:4px;overflow:auto">${lang ? `<code class="language-${escapeAttr(lang)}">` : "<code>"}${code}</code></pre>`;
    }

    case "table": {
      const rows = node.content ?? [];
      const headerRow = rows[0];
      const bodyRows = rows.slice(1);
      const thead = headerRow ? `<thead>${convertTableRow(headerRow, true)}</thead>` : "";
      const tbody =
        bodyRows.length > 0
          ? `<tbody>${bodyRows.map((r) => convertTableRow(r, false)).join("")}</tbody>`
          : "";
      return `<table style="border-collapse:collapse;width:100%">${thead}${tbody}</table>`;
    }

    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "");
      const safeSrc = isSafeImageUrl(src) ? src : "";
      return safeSrc
        ? `<img src="${escapeAttr(safeSrc)}" alt="${escapeAttr(alt)}" style="max-width:100%">`
        : `<p><em>[image removed — unsafe URL]</em></p>`;
    }

    case "horizontalRule":
      return `<hr>`;

    default: {
      // Interactive blocks render as a styled placeholder with a deep-link back to BusAcTa.
      // Unknown nodes with children are recursed; leaf nodes produce nothing.
      const labelMap: Record<string, string> = {
        kanbanBlock: "📋 Kanban board",
        drawingBlock: "🎨 Drawing",
        progressBlock: "📊 Progress tracker",
        calendarBlock: "📅 Calendar",
      };
      const label = labelMap[node.type];
      if (label) {
        return `<p><em style="color:#888">[${label} — view in BusAcTa]</em></p>`;
      }
      // For any other node with children, recurse
      if (node.content) return convertNodes(node.content);
      return "";
    }
  }
}

export function tiptapJsonToOneNoteHtml(
  contentJson: unknown,
  title: string,
  noteDate: string,
  busActaBaseUrl: string,
  noteId: string,
): string {
  const doc = contentJson as TiptapNode | null;
  const dateLabel = (() => {
    try {
      return format(parseISO(noteDate), "EEEE, d MMMM yyyy");
    } catch {
      return noteDate;
    }
  })();

  const bodyHtml = doc?.content ? doc.content.map(convertNode).join("") : "<p></p>";

  const deepLink = `${busActaBaseUrl.replace(/\/$/, "")}/notes/${noteId}`;

  return `<!DOCTYPE html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <meta name="created" content="${new Date().toISOString()}" />
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p style="color:#888;font-size:0.85em">${escapeHtml(dateLabel)} · <a href="${escapeAttr(deepLink)}">Open in BusAcTa</a></p>
    ${bodyHtml}
  </body>
</html>`;
}

export function tiptapJsonToOneNoteBodyHtml(
  contentJson: unknown,
  title: string,
  noteDate: string,
  busActaBaseUrl: string,
  noteId: string,
): string {
  // Extract just the inner body HTML for PATCH operations
  const full = tiptapJsonToOneNoteHtml(contentJson, title, noteDate, busActaBaseUrl, noteId);
  const bodyMatch = full.match(/<body>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : full;
}
