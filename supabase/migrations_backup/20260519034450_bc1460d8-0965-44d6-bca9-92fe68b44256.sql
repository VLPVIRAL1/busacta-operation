
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS position_title text,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS join_date date,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_employment_type_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_employment_type_check
      CHECK (employment_type IS NULL OR employment_type IN ('full_time','part_time','contractor','intern'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_employee_id_unique_ci
  ON public.profiles (lower(employee_id))
  WHERE employee_id IS NOT NULL;
