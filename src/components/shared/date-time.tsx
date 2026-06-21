import { cn } from "@/lib/shared/utils";

/**
 * Date / time text styled with tabular-nums + mono for crisp alignment.
 * mode "date" → Mar 12, 2025
 * mode "time" → 03:42 PM
 * mode "datetime" → Mar 12, 2025 · 03:42 PM
 * mode "short" → 3/12/25
 */
export function DateTime({
  value,
  mode = "datetime",
  className,
}: {
  value: string | number | Date | null | undefined;
  mode?: "date" | "time" | "datetime" | "short";
  className?: string;
}) {
  if (value === null || value === undefined || value === "")
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime()))
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  let text = "";
  if (mode === "date")
    text = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  else if (mode === "time")
    text = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  else if (mode === "short")
    text = d.toLocaleDateString(undefined, { year: "2-digit", month: "numeric", day: "numeric" });
  else
    text = `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <time
      dateTime={d.toISOString()}
      className={cn("font-mono tabular-nums tracking-tight", className)}
    >
      {text}
    </time>
  );
}
