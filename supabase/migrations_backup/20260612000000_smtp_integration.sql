-- Seed an empty SMTP row in integration_credentials so the admin UI
-- can display the form without a 404. All fields default to empty/disabled;
-- the admin fills them in via Admin → Integration → Email.
INSERT INTO public.integration_credentials (
  integration_key,
  display_name,
  config,
  is_active,
  created_at,
  updated_at
) VALUES (
  'smtp',
  'SMTP Email',
  jsonb_build_object(
    'host',       '',
    'port',       465,
    'secure',     true,
    'user',       '',
    'password',   '',
    'from_email', '',
    'from_name',  'BusAcTa Operations'
  ),
  false,
  now(),
  now()
) ON CONFLICT (integration_key) DO NOTHING;
