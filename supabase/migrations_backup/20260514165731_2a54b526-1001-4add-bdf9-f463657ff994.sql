-- Group-stop RPC: any member of a multi-person timer group can close ALL open rows in that group.
-- SECURITY DEFINER bypasses the per-row "user_id = auth.uid()" RLS update policy, but we
-- explicitly verify the caller is a member of the group before doing anything.
CREATE OR REPLACE FUNCTION public.stop_timer_group(_group_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_member boolean;
  _closed int := 0;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _group_id IS NULL THEN
    RAISE EXCEPTION 'group id required';
  END IF;

  -- Caller must be a member of this timer group (have at least one row in it).
  SELECT EXISTS (
    SELECT 1 FROM public.time_logs
    WHERE timer_group_id = _group_id AND user_id = _caller
  ) INTO _is_member;

  IF NOT _is_member
     AND NOT public.has_role(_caller, 'admin'::app_role)
     AND NOT public.has_role(_caller, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: caller is not a member of this timer group';
  END IF;

  WITH closed AS (
    UPDATE public.time_logs
       SET ended_at = now(),
           duration_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (now() - started_at)) / 60)::int)
     WHERE timer_group_id = _group_id
       AND ended_at IS NULL
     RETURNING 1
  )
  SELECT count(*) INTO _closed FROM closed;

  RETURN _closed;
END;
$$;

REVOKE ALL ON FUNCTION public.stop_timer_group(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.stop_timer_group(uuid) TO authenticated;