-- Rename the from_name in email integration credentials from
-- 'BusAcTa One' to 'BusAcTa Operations' to match the product rebrand.
UPDATE public.integration_credentials
SET
  config    = jsonb_set(config, '{from_name}', '"BusAcTa Operations"'),
  updated_at = now()
WHERE config->>'from_name' = 'BusAcTa One';
