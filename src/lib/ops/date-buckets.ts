/**
 * Date-bucket helpers for Ops filter chips (Today / This week / Overdue / Updated).
 *
 * All buckets are anchored to the team's business timezone (IST / Asia/Kolkata,
 * UTC+5:30) so that "Today" means the same calendar day for every user
 * regardless of their browser timezone, and never drifts at midnight in the
 * caller's local zone.
 *
 * Returned values are UTC epoch milliseconds — directly comparable to
 * `new Date(dueStr).getTime()`.
 */

export const BUSINESS_TZ = "Asia/Kolkata";

/** IST offset from UTC, in ms (+5h30m). India does not observe DST so a
 *  fixed offset is correct. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Start of the IST calendar day that contains `d`, expressed as UTC ms. */
export function istDayStart(d: Date | number = new Date()): number {
  const t = typeof d === "number" ? d : d.getTime();
  const ist = new Date(t + IST_OFFSET_MS);
  const ist0Utc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return ist0Utc - IST_OFFSET_MS;
}

/** Exclusive end of the IST calendar day containing `d` (== next IST midnight). */
export function istDayEnd(d: Date | number = new Date()): number {
  return istDayStart(d) + 86_400_000;
}

/** Inclusive end-of-day, 7 IST days from the start of today. Used so that
 *  Sunday tasks count for the "This week" chip when checked any time on
 *  the prior Monday. */
export function istWeekEnd(d: Date | number = new Date()): number {
  return istDayStart(d) + 7 * 86_400_000;
}

/** Cutoff timestamp for "Updated in last N days" filters — items with
 *  updated_at >= this value pass. */
export function istUpdatedCutoff(
  span: "today" | "7d" | "30d",
  d: Date | number = new Date(),
): number {
  const days = span === "today" ? 1 : span === "7d" ? 7 : 30;
  return istDayStart(d) - (days - 1) * 86_400_000;
}
