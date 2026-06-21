
CREATE OR REPLACE FUNCTION public.lookup_invitation(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  inv public.invitations;
  firm_name text;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE token = _token;
  IF inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;
  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation already used');
  END IF;
  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation has expired');
  END IF;

  IF inv.firm_id IS NOT NULL THEN
    SELECT name INTO firm_name FROM public.firms WHERE id = inv.firm_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'email', inv.email,
    'role', inv.role,
    'firm_name', firm_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_invitation(text) TO anon, authenticated;
