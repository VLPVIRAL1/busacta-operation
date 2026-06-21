-- Shared reminders + colour tags + priority
--
-- Personal reminders become collaborative: an owner can tag other users, who
-- then see the reminder in their own panel and may complete or edit it.
-- RLS mirrors the daily_notes sharing model (SECURITY DEFINER helpers so the
-- cross-table policy checks do not recurse).

-- 1) New columns on personal_reminders ------------------------------------
ALTER TABLE public.personal_reminders
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high'));

-- 2) reminder_shares (mirrors daily_note_shares) --------------------------
CREATE TABLE IF NOT EXISTS public.reminder_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reminder_id uuid NOT NULL REFERENCES public.personal_reminders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reminder_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reminder_shares_user ON public.reminder_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_shares_reminder ON public.reminder_shares(reminder_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_shares TO authenticated;
GRANT ALL ON public.reminder_shares TO service_role;

ALTER TABLE public.reminder_shares ENABLE ROW LEVEL SECURITY;

-- 3) SECURITY DEFINER helpers (mirror user_owns_note / user_has_note_share)
CREATE OR REPLACE FUNCTION public.user_owns_reminder(p_reminder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personal_reminders r
    WHERE r.id = p_reminder_id AND r.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_reminder_share(p_reminder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reminder_shares s
    WHERE s.reminder_id = p_reminder_id AND s.user_id = auth.uid()
  );
$$;

-- 4) reminder_shares policies (mirror shares_owner_manage / shares_user_see_own)
DROP POLICY IF EXISTS "reminder_shares_owner_manage" ON public.reminder_shares;
CREATE POLICY "reminder_shares_owner_manage" ON public.reminder_shares FOR ALL TO authenticated
  USING (public.user_owns_reminder(reminder_id))
  WITH CHECK (public.user_owns_reminder(reminder_id));

DROP POLICY IF EXISTS "reminder_shares_user_see_own" ON public.reminder_shares;
CREATE POLICY "reminder_shares_user_see_own" ON public.reminder_shares FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 5) personal_reminders: grant shared recipients view + update -------------
--    (insert/delete stay owner-only via the existing reminders_owner_* policies)
DROP POLICY IF EXISTS "reminders_shared_select" ON public.personal_reminders;
CREATE POLICY "reminders_shared_select" ON public.personal_reminders FOR SELECT TO authenticated
  USING (public.user_has_reminder_share(id));

DROP POLICY IF EXISTS "reminders_shared_update" ON public.personal_reminders;
CREATE POLICY "reminders_shared_update" ON public.personal_reminders FOR UPDATE TO authenticated
  USING (public.user_has_reminder_share(id));

-- 6) Realtime --------------------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reminder_shares;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
