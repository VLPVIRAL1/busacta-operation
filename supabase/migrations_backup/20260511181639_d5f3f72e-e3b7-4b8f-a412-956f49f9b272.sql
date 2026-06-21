ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.firms DROP COLUMN IF EXISTS billing_address;