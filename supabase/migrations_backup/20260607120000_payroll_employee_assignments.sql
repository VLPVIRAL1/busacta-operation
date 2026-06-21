-- Add name to company_hr_settings so multiple named attendance policies can be distinguished
ALTER TABLE company_hr_settings ADD COLUMN IF NOT EXISTS name text;
UPDATE company_hr_settings SET name = 'Standard Policy' WHERE name IS NULL;

-- Per-employee assignments: which attendance policy and holiday year applies
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attendance_settings_id uuid REFERENCES company_hr_settings(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS holiday_calendar_year integer;
