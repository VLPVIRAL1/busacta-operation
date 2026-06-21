-- Add festival (recurring annual) support to payroll_holidays.
-- Festival rows carry a month+day rule instead of a specific date, and are
-- materialised for any requested year at query time in the application layer.

ALTER TABLE payroll_holidays
  ADD COLUMN IF NOT EXISTS is_festival    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS festival_month integer CHECK (festival_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS festival_day   integer CHECK (festival_day   BETWEEN 1 AND 31);

-- holiday_date is NULL for festival rows
ALTER TABLE payroll_holidays ALTER COLUMN holiday_date DROP NOT NULL;

-- Ensure every row is either a normal holiday OR a festival, never neither/both
ALTER TABLE payroll_holidays
  ADD CONSTRAINT chk_holiday_or_festival CHECK (
    (NOT is_festival AND holiday_date IS NOT NULL) OR
    (    is_festival AND festival_month IS NOT NULL AND festival_day IS NOT NULL)
  );
