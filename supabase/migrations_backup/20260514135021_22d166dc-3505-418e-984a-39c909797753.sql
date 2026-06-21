
-- ===== Item 6: QBO-style reconciliation =====

ALTER TABLE public.petty_cash_reconciliations
  ADD COLUMN IF NOT EXISTS statement_date date,
  ADD COLUMN IF NOT EXISTS ending_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cleared_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difference numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.petty_cash_recon_clearings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid NOT NULL REFERENCES public.petty_cash_reconciliations(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.petty_cash_transactions(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  cleared_by uuid,
  UNIQUE (reconciliation_id, transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_pcrc_recon ON public.petty_cash_recon_clearings(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_pcrc_tx ON public.petty_cash_recon_clearings(transaction_id);

ALTER TABLE public.petty_cash_recon_clearings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage petty_cash_recon_clearings"
  ON public.petty_cash_recon_clearings
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'finance_manager'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'finance_manager'::app_role)
  );

-- Enforce difference = 0 when transitioning to submitted/approved
CREATE OR REPLACE FUNCTION public.enforce_recon_zero_difference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('submitted','approved')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.difference <> 0 THEN
    RAISE EXCEPTION 'Reconciliation cannot be % while difference is % (must equal 0)', NEW.status, NEW.difference;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pcr_enforce_zero_diff ON public.petty_cash_reconciliations;
CREATE TRIGGER pcr_enforce_zero_diff
  BEFORE UPDATE ON public.petty_cash_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_recon_zero_difference();


-- ===== Item 10: Team direct messaging =====

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('dm','group')),
  name text,
  dm_key text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_threads_name_for_group CHECK (
    (kind = 'group' AND name IS NOT NULL AND length(trim(name)) > 0)
    OR (kind = 'dm')
  ),
  CONSTRAINT chat_threads_dmkey_for_dm CHECK (
    (kind = 'dm' AND dm_key IS NOT NULL) OR (kind = 'group' AND dm_key IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_chat_threads_dm_key
  ON public.chat_threads(dm_key) WHERE kind = 'dm';

CREATE TABLE IF NOT EXISTS public.chat_thread_members (
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ctm_user ON public.chat_thread_members(user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  attachments jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON public.chat_messages(thread_id, created_at DESC);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_thread_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a member of a thread?
CREATE OR REPLACE FUNCTION public.is_chat_thread_member(_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_thread_members
    WHERE thread_id = _thread_id AND user_id = auth.uid()
  );
$$;

-- chat_threads policies
CREATE POLICY "Members read chat_threads"
  ON public.chat_threads FOR SELECT
  TO authenticated
  USING (public.is_chat_thread_member(id));

CREATE POLICY "Internal users create chat_threads"
  ON public.chat_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_internal_user_id(auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Owners update chat_threads"
  ON public.chat_threads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_thread_members
      WHERE thread_id = id AND user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_thread_members
      WHERE thread_id = id AND user_id = auth.uid() AND role = 'owner'
    )
  );

-- chat_thread_members policies
CREATE POLICY "Members read chat_thread_members"
  ON public.chat_thread_members FOR SELECT
  TO authenticated
  USING (public.is_chat_thread_member(thread_id));

CREATE POLICY "Owner or self adds members"
  ON public.chat_thread_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Self-insert when creating a thread, or owner adding others
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_thread_members
      WHERE thread_id = chat_thread_members.thread_id
        AND user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "Members update own membership"
  ON public.chat_thread_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner or self removes membership"
  ON public.chat_thread_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_thread_members m2
      WHERE m2.thread_id = chat_thread_members.thread_id
        AND m2.user_id = auth.uid() AND m2.role = 'owner'
    )
  );

-- chat_messages policies
CREATE POLICY "Members read chat_messages"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (public.is_chat_thread_member(thread_id));

CREATE POLICY "Members write chat_messages"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND public.is_chat_thread_member(thread_id)
  );

CREATE POLICY "Authors update own chat_messages"
  ON public.chat_messages FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors delete own chat_messages"
  ON public.chat_messages FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_thread_members;
