// Dual-timezone helpers for B2B IST/EST coordination.

const IST_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  day: "2-digit",
  month: "short",
});
const EST_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  day: "2-digit",
  month: "short",
});

export function fmtIST(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${IST_FMT.format(dt)} IST`;
}
export function fmtEST(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${EST_FMT.format(dt)} EST`;
}
export function fmtDual(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return `${fmtIST(d)}  /  ${fmtEST(d)}`;
}

// WhatsApp/Slack-style relative timestamp for inbox rows.
// Today → "1:36 PM" · Yesterday → "Yesterday" · same year → "5 May" · older → "5/17/26".
const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const DAY_MONTH_FMT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});
export function formatInboxTimestamp(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(dt)) / 86_400_000);
  if (diffDays <= 0) return TIME_FMT.format(dt);
  if (diffDays === 1) return "Yesterday";
  if (dt.getFullYear() === now.getFullYear()) return DAY_MONTH_FMT.format(dt);
  const m = dt.getMonth() + 1;
  const d2 = dt.getDate();
  const y = String(dt.getFullYear()).slice(-2);
  return `${m}/${d2}/${y}`;
}
