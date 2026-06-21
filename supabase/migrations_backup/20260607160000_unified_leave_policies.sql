-- Extend company_hr_settings so each named attendance policy also carries
-- leave quota rules, making it the single source of truth for both attendance
-- timing and leave entitlements. is_active already exists on this table.

ALTER TABLE company_hr_settings
  ADD COLUMN IF NOT EXISTS el_quota              integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS cl_quota              integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS sl_quota              integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS el_carry_forward_max  integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS cl_carry_forward_max  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sl_carry_forward_max  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS el_opening_balance    numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cl_opening_balance    numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sl_opening_balance    numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_date  date;
