
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invitations;
  current_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT email INTO current_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO inv FROM public.invitations WHERE token = _token;
  IF inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  END IF;
  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_accepted');
  END IF;
  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF lower(inv.email) <> lower(current_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), inv.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF inv.firm_id IS NOT NULL THEN
    UPDATE public.profiles SET firm_id = inv.firm_id WHERE id = auth.uid();
  END IF;

  UPDATE public.invitations SET accepted_at = now() WHERE id = inv.id;

  RETURN jsonb_build_object('ok', true, 'role', inv.role, 'firm_id', inv.firm_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
