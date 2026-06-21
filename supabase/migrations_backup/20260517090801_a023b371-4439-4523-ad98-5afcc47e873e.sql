CREATE OR REPLACE FUNCTION public.restore_all_chat_archives()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _n int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  WITH d AS (
    DELETE FROM public.chat_archive_state WHERE user_id = _uid RETURNING 1
  ) SELECT count(*) INTO _n FROM d;
  RETURN _n;
END $$;

GRANT EXECUTE ON FUNCTION public.restore_all_chat_archives() TO authenticated;