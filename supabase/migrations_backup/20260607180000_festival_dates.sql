-- Support year-specific (non-recurring) festival dates.
-- Festivals like Diwali change date every year and need per-year entries.

ALTER TABLE payroll_holidays
  ADD COLUMN IF NOT EXISTS is_recurring   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS festival_dates jsonb   NOT NULL DEFAULT '[]'::jsonb;

-- All existing festival rows are recurring (they have fixed month+day).
UPDATE payroll_holidays SET is_recurring = true WHERE is_festival = true;

-- Relax constraint: non-recurring festivals have no fixed month/day.
ALTER TABLE payroll_holidays DROP CONSTRAINT IF EXISTS chk_holiday_or_festival;
ALTER TABLE payroll_holidays
  ADD CONSTRAINT chk_holiday_or_festival CHECK (
    (NOT is_festival AND holiday_date IS NOT NULL)
    OR (is_festival AND is_recurring     AND festival_month IS NOT NULL AND festival_day IS NOT NULL)
    OR (is_festival AND NOT is_recurring)
  );
