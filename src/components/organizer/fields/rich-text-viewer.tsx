import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { sanitizeRichHtml } from "@/lib/organizer/rich-text";

interface Props {
  value: unknown;
  className?: string;
}

/**
 * Renders a stored rich-text answer. We sanitize on the server (sanitizeRichHtml)
 * and again on the client (DOMPurify) before injecting — defense in depth.
 */
export function RichTextViewer({ value, className }: Props) {
  const [html, setHtml] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raw = "";
    if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (v.kind === "rich" && typeof v.html === "string") raw = v.html;
      else if (v.kind === "plain" && typeof v.text === "string") {
        raw = `<p>${v.text.replace(/</g, "&lt;")}</p>`;
      }
    } else if (typeof value === "string") {
      raw = `<p>${value.replace(/</g, "&lt;")}</p>`;
    }
    const pass1 = sanitizeRichHtml(raw);
    const pass2 = DOMPurify.sanitize(pass1, {
      ALLOWED_TAGS: [
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
      ],
      ALLOWED_ATTR: ["href", "title", "target", "rel", "style", "colspan", "rowspan", "span"],
    });
    setHtml(pass2);
  }, [value]);

  if (!html) {
    return <p className={className ?? "text-sm italic text-muted-foreground"}>No answer</p>;
  }
  return (
    <div
      ref={ref}
      className={className ?? "prose prose-sm dark:prose-invert max-w-none"}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
