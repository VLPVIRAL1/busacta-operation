-- Seed an empty Resend row in integration_credentials so the admin UI
-- can display its config card without a 404. Inactive by default.
INSERT INTO public.integration_credentials (
  integration_key,
  display_name,
  config,
  is_active,
  created_at,
  updated_at
) VALUES (
  'resend',
  'Resend',
  jsonb_build_object(
    'api_key',    '',
    'from_email', '',
    'from_name',  'BusAcTa Operations'
  ),
  false,
  now(),
  now()
) ON CONFLICT (integration_key) DO NOTHING;
