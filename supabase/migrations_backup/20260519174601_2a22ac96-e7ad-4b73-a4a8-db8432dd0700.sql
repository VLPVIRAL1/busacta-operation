CREATE OR REPLACE FUNCTION public.user_can_view_thread(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT cea.user_id INTO v_owner
  FROM public.tracked_email_threads t
  JOIN public.connected_email_accounts cea ON cea.id = t.account_id
  WHERE t.id = _thread_id;

  RETURN v_owner IS NOT NULL AND v_owner = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.user_can_view_thread(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_view_thread(uuid, uuid) TO authenticated;