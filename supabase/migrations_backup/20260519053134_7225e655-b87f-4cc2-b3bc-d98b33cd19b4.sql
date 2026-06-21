-- Seed the security settings row if missing.
INSERT INTO public.app_settings (id, value)
VALUES ('security', jsonb_build_object('mfa_enforcement_enabled', true))
ON CONFLICT (id) DO UPDATE
  SET value = public.app_settings.value
            || jsonb_build_object(
                 'mfa_enforcement_enabled',
                 COALESCE(public.app_settings.value->'mfa_enforcement_enabled', 'true'::jsonb)
               );

-- Patch mfa_enforcement_status() to honour the bypass flag.
CREATE OR REPLACE FUNCTION public.mfa_enforcement_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _required boolean;
  _enrolled boolean;
  _enforced boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT COALESCE((value->>'mfa_enforcement_enabled')::boolean, true)
    INTO _enforced
    FROM public.app_settings
   WHERE id = 'security';
  _enforced := COALESCE(_enforced, true);

  _required := public.user_requires_mfa(_uid) AND _enforced;
  _enrolled := public.user_has_verified_mfa(_uid);

  RETURN jsonb_build_object(
    'authenticated', true,
    'required', _required,
    'enrolled', _enrolled,
    'compliant', (NOT _required) OR _enrolled,
    'enforcement_enabled', _enforced
  );
END $function$;