// DD-MMM-YYYY format used across the Petty Cash hub.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDMY(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mmm = MONTHS[dt.getMonth()];
  const yyyy = dt.getFullYear();
  return `${dd}-${mmm}-${yyyy}`;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
