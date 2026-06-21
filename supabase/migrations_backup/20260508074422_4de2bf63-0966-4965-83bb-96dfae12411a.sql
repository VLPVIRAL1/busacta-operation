-- Ensure 'other' exists on the software enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
                 WHERE t.typname = 'software_type' AND e.enumlabel = 'other') THEN
    ALTER TYPE software_type ADD VALUE 'other';
  END IF;
EXCEPTION WHEN undefined_object THEN
  CREATE TYPE software_type AS ENUM ('lacerte','drake','cch_axcess','ultratax','proconnect','other');
END $$;

-- Add multi-select software array on client_entities
ALTER TABLE public.client_entities
  ADD COLUMN IF NOT EXISTS software software_type[] NOT NULL DEFAULT '{}';