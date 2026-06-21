
-- Provenance for every profile row.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS provisioned_via text NOT NULL DEFAULT 'legacy';

-- Whitelist allowed values (NOT a CHECK on a function — pure constant set is fine).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_provisioned_via_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_provisioned_via_check
  CHECK (provisioned_via IN ('firm_hub','hr_hub','self_signup','legacy'));

CREATE INDEX IF NOT EXISTS idx_profiles_provisioned_via
  ON public.profiles (provisioned_via);
