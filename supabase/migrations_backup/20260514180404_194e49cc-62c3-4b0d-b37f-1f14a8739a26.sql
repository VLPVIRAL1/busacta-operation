ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS period text;
COMMENT ON COLUMN public.tasks.period IS 'Reporting period for the work item (Monthly / Quarterly / Annual / Ad-hoc / free text).';