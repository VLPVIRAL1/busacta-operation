-- Atomic creation of chat threads + members, bypassing the chicken/egg between
-- the chat_threads INSERT policy (requires created_by = auth.uid()) and the
-- chat_thread_members INSERT policy (requires an owner row to already exist).
CREATE OR REPLACE FUNCTION public.create_chat_thread(
  _kind text,
  _member_ids uuid[],
  _name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _thread_id uuid;
  _dm_key text;
  _other uuid;
  _existing uuid;
  _members uuid[];
  _m uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_internal_user_id(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _kind NOT IN ('dm','group') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF _member_ids IS NULL OR array_length(_member_ids,1) IS NULL THEN
    RAISE EXCEPTION 'no_members';
  END IF;

  -- De-dup + drop self; we add the creator as owner below.
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(_member_ids) AS x WHERE x <> _uid)
    INTO _members;

  IF _kind = 'dm' THEN
    IF array_length(_members,1) <> 1 THEN RAISE EXCEPTION 'dm_requires_one_other'; END IF;
    _other := _members[1];
    SELECT CASE WHEN _uid < _other THEN _uid::text || ':' || _other::text
                ELSE _other::text || ':' || _uid::text END
      INTO _dm_key;

    SELECT id INTO _existing
      FROM public.chat_threads
     WHERE kind = 'dm' AND dm_key = _dm_key
     LIMIT 1;
    IF _existing IS NOT NULL THEN RETURN _existing; END IF;

    INSERT INTO public.chat_threads(kind, dm_key, name, created_by)
      VALUES ('dm', _dm_key, NULL, _uid)
      RETURNING id INTO _thread_id;
  ELSE
    IF _name IS NULL OR length(btrim(_name)) = 0 THEN RAISE EXCEPTION 'group_requires_name'; END IF;
    INSERT INTO public.chat_threads(kind, dm_key, name, created_by)
      VALUES ('group', NULL, btrim(_name), _uid)
      RETURNING id INTO _thread_id;
  END IF;

  INSERT INTO public.chat_thread_members(thread_id, user_id, role)
    VALUES (_thread_id, _uid, 'owner');

  FOREACH _m IN ARRAY _members LOOP
    INSERT INTO public.chat_thread_members(thread_id, user_id, role)
      VALUES (_thread_id, _m, 'member')
      ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN _thread_id;
END $$;

REVOKE ALL ON FUNCTION public.create_chat_thread(text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_chat_thread(text, uuid[], text) TO authenticated;