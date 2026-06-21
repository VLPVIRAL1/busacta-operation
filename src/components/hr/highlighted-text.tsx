import { useMemo } from "react";
import { fuzzyMatch } from "@/lib/hr/fuzzy-search";

/** Renders `text` with character ranges matching `query` wrapped in <mark>. */
export function HighlightedText({
  text,
  query,
  className,
}: {
  text: string | null | undefined;
  query: string;
  className?: string;
}) {
  const value = text ?? "";
  const ranges = useMemo(() => {
    if (!query.trim()) return [] as Array<[number, number]>;
    return fuzzyMatch(query, value).ranges;
  }, [value, query]);

  if (ranges.length === 0) return <span className={className}>{value}</span>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([s, e], i) => {
    if (s > cursor) parts.push(value.slice(cursor, s));
    parts.push(
      <mark
        key={i}
        className="bg-amber-200/60 dark:bg-amber-400/30 text-foreground rounded-sm px-0.5"
      >
        {value.slice(s, e)}
      </mark>,
    );
    cursor = e;
  });
  if (cursor < value.length) parts.push(value.slice(cursor));
  return <span className={className}>{parts}</span>;
}
