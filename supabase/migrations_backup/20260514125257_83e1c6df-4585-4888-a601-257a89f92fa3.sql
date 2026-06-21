CREATE OR REPLACE FUNCTION public.mfa_required_coverage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int;
  _enrolled int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT count(DISTINCT ur.user_id)
    INTO _total
    FROM public.user_roles ur
    JOIN public.mfa_required_roles m ON m.role = ur.role;
  SELECT count(DISTINCT ur.user_id)
    INTO _enrolled
    FROM public.user_roles ur
    JOIN public.mfa_required_roles m ON m.role = ur.role
    WHERE EXISTS (
      SELECT 1 FROM auth.mfa_factors f
       WHERE f.user_id = ur.user_id AND f.status = 'verified'
    );
  RETURN jsonb_build_object('total_required', _total, 'enrolled', _enrolled);
END $$;

REVOKE EXECUTE ON FUNCTION public.mfa_required_coverage() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_required_coverage() TO authenticated;