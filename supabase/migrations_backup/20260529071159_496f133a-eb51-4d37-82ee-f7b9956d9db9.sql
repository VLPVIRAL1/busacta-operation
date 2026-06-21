
-- Helper: does the current user have any share (or 'edit' share) on a given note?
CREATE OR REPLACE FUNCTION public.user_has_note_share(_note_id uuid, _require_edit boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.daily_note_shares s
    WHERE s.note_id = _note_id
      AND s.user_id = auth.uid()
      AND (NOT _require_edit OR s.permission = 'edit')
  );
$$;

-- Helper: does the current user own the given note?
CREATE OR REPLACE FUNCTION public.user_owns_note(_note_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.daily_notes n
    WHERE n.id = _note_id AND n.owner_id = auth.uid()
  );
$$;

-- Rebuild daily_notes share policies using helper
DROP POLICY IF EXISTS notes_shared_select ON public.daily_notes;
DROP POLICY IF EXISTS notes_shared_edit_update ON public.daily_notes;

CREATE POLICY notes_shared_select ON public.daily_notes
FOR SELECT TO authenticated
USING (public.user_has_note_share(id, false));

CREATE POLICY notes_shared_edit_update ON public.daily_notes
FOR UPDATE TO authenticated
USING (public.user_has_note_share(id, true));

-- Rebuild daily_note_shares owner policy using helper
DROP POLICY IF EXISTS shares_owner_manage ON public.daily_note_shares;

CREATE POLICY shares_owner_manage ON public.daily_note_shares
FOR ALL TO authenticated
USING (public.user_owns_note(note_id))
WITH CHECK (public.user_owns_note(note_id));
