ALTER TABLE public.esign_recipients
  ADD COLUMN IF NOT EXISTS signing_ip INET,
  ADD COLUMN IF NOT EXISTS signing_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS signing_geo_country TEXT,
  ADD COLUMN IF NOT EXISTS signing_geo_region TEXT,
  ADD COLUMN IF NOT EXISTS signing_geo_city TEXT;