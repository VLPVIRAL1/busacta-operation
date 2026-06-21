/** Day grouping for chat date dividers. "Today" / "Yesterday" / "Mon, May 16, 2026". */
export function dayKey(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(dt, today)) return "Today";
  if (same(dt, yest)) return "Yesterday";
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: dt.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/** Short time inside a bubble, e.g. "10:32 AM". */
export function bubbleTime(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "online" | "last seen today at 10:30 AM" | "last seen yesterday at 9:14 PM" | "last seen May 12" */
export function lastSeenLabel(d: string | Date | null | undefined, online: boolean): string {
  if (online) return "online";
  if (!d) return "offline";
  const dt = typeof d === "string" ? new Date(d) : d;
  const key = dayKey(dt);
  if (key === "Today") return `last seen today at ${bubbleTime(dt)}`;
  if (key === "Yesterday") return `last seen yesterday at ${bubbleTime(dt)}`;
  return `last seen ${key}`;
}
