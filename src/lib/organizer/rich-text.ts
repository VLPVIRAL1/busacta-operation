// Server-safe rich-text helpers (no DOM access).
//
// `sanitizeRichHtml` strips disallowed tags/attributes using a tiny
// allowlist-based regex pipeline. It is intentionally conservative — the
// canonical answer is the Tiptap doc JSON; the HTML is just for fast render.
// On the client we re-sanitize with DOMPurify before injecting into the DOM
// (see `RichTextViewer`). This module is safe to import in server functions
// and shared schemas without pulling in `jsdom`.

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "span",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  span: new Set(["style"]),
  td: new Set(["colspan", "rowspan", "style"]),
  th: new Set(["colspan", "rowspan", "style"]),
  col: new Set(["span", "style"]),
  table: new Set(["style"]),
};

// Only allow a tiny CSS allowlist (color + background-color hex/rgb).
const SAFE_STYLE_RE = /^(?:color|background-color|text-align)\s*:\s*[#a-zA-Z0-9(),.\s%-]+$/;

function sanitizeStyle(value: string): string {
  return value
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && SAFE_STYLE_RE.test(d))
    .join("; ");
}

function sanitizeAttrs(tag: string, rawAttrs: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";
  const parts: string[] = [];
  const attrRe = /([a-zA-Z_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(rawAttrs))) {
    const name = m[1].toLowerCase();
    if (!allowed.has(name)) continue;
    let val = m[2] ?? m[3] ?? "";
    if (name === "href") {
      if (!/^(https?:|mailto:|\/)/i.test(val)) continue;
    }
    if (name === "style") {
      val = sanitizeStyle(val);
      if (!val) continue;
    }
    parts.push(`${name}="${val.replace(/"/g, "&quot;")}"`);
  }
  // Force safe link rels when target is set
  if (tag === "a" && /target=/.test(parts.join(" "))) {
    parts.push('rel="noopener noreferrer nofollow"');
  }
  return parts.length ? " " + parts.join(" ") : "";
}

export function sanitizeRichHtml(input: string): string {
  if (!input) return "";
  // Strip <script>, <style>, <iframe>, <object>, <embed>, comments outright.
  let html = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(script|style|iframe|object|embed|link|meta)[^>]*>/gi, "");

  // Walk tags. Allowlist-based: unknown tags are dropped but inner text kept.
  html = html.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (match, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (match.startsWith("</")) return `</${tag}>`;
      const selfClosing = match.endsWith("/>");
      return `<${tag}${sanitizeAttrs(tag, rawAttrs)}${selfClosing ? " /" : ""}>`;
    },
  );

  // Neutralize javascript: and on* handlers that slipped through as text.
  html = html.replace(/javascript:/gi, "");
  return html;
}

// ----- Answer piping --------------------------------------------------------

// Token: {{block:<uuid>}} or {{block:<uuid>|fallback text}}
const PIPING_RE = /\{\{\s*block\s*:\s*([0-9a-f-]{8,})(?:\s*\|\s*([^}]*))?\}\}/gi;

export type PipingResolver = (text: string | null | undefined) => string;

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(formatScalar).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("text" in obj) return formatScalar(obj.text);
    if ("value" in obj) return formatScalar(obj.value);
    if ("iso" in obj) return formatScalar(obj.iso);
    if ("typedName" in obj) return formatScalar(obj.typedName);
  }
  return "";
}

/**
 * Create a resolver that replaces `{{block:<id>}}` tokens with the
 * corresponding answer's scalar representation.
 */
export function createPipingResolver(
  answers: Map<string, unknown> | Record<string, unknown>,
): PipingResolver {
  const get = (id: string): unknown => {
    if (answers instanceof Map) return answers.get(id);
    return (answers as Record<string, unknown>)[id];
  };
  return (text) => {
    if (!text) return "";
    return text.replace(PIPING_RE, (_match, id: string, fallback?: string) => {
      const v = formatScalar(get(id));
      if (v) return v;
      return (fallback ?? "").trim();
    });
  };
}

/**
 * Walks a Tiptap doc JSON and resolves piping tokens in all text nodes.
 * Returns a new doc; never mutates the input.
 */
export function resolvePipingInDoc<T>(doc: T, resolve: PipingResolver): T {
  if (!doc || typeof doc !== "object") return doc;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const next: Record<string, unknown> = { ...obj };
      if (typeof obj.text === "string") next.text = resolve(obj.text);
      if (Array.isArray(obj.content)) next.content = (obj.content as unknown[]).map(walk);
      return next;
    }
    return node;
  };
  return walk(doc) as T;
}

/** Returns true if a string contains any piping token. */
export function hasPipingTokens(text: string | null | undefined): boolean {
  if (!text) return false;
  PIPING_RE.lastIndex = 0;
  return PIPING_RE.test(text);
}
