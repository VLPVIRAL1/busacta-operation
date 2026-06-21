
-- =========================================================================
-- PHASE 1: SOC 2 / HIPAA database hardening (corrected)
-- =========================================================================

-- 1. Lock down SECURITY DEFINER functions ---------------------------------
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.assign_invoice_no()',
    'public.default_task_pipeline_stage()',
    'public.enforce_journal_balance()',
    'public.enforce_profile_self_update()',
    'public.ensure_project_default_entity(uuid)',
    'public.seed_default_pipeline_stages()',
    'public.seed_default_project_setup()',
    'public.stamp_effective_editor()',
    'public.sync_subtask_status_done()',
    'public.task_action_items_audit()',
    'public.task_action_items_before_ins()',
    'public.task_action_items_before_upd()',
    'public.trg_task_subtasks_default_sort()',
    'public.trg_task_subtasks_normalize()'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.current_client_firm_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_app_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_firm_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.firm_member_can(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_internal_user_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.task_capability(uuid, text) FROM anon;

-- 2. Storage: deny listing on avatars + vendor-avatars --------------------
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Vendor avatars public read" ON storage.objects;

CREATE POLICY "Avatar read scoped"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_internal_user_id(auth.uid())
  )
);

CREATE POLICY "Vendor avatars internal read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'vendor-avatars'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'finance_manager'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
  )
);

-- 3. Edit-window triggers on task_notes / task_links / task_action_items --
CREATE OR REPLACE FUNCTION public.enforce_30min_edit_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _author uuid;
  _created timestamptz;
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'task_notes' THEN
    _author := OLD.author_id; _created := OLD.created_at;
    IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'Cannot change author';
    END IF;
  ELSIF TG_TABLE_NAME = 'task_links' THEN
    _author := OLD.created_by; _created := OLD.created_at;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Cannot change creator';
    END IF;
  ELSIF TG_TABLE_NAME = 'task_action_items' THEN
    _author := OLD.created_by; _created := OLD.created_at;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Cannot change creator';
    END IF;
  END IF;

  IF NEW.task_id IS DISTINCT FROM OLD.task_id THEN
    RAISE EXCEPTION 'Cannot move row to a different task';
  END IF;

  IF _author IS NOT NULL
     AND _author <> auth.uid()
     AND _created < (now() - INTERVAL '30 minutes') THEN
    RAISE EXCEPTION 'Edit window has expired (30 minutes)';
  END IF;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.enforce_30min_edit_window() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS task_notes_edit_window ON public.task_notes;
CREATE TRIGGER task_notes_edit_window
  BEFORE UPDATE ON public.task_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_30min_edit_window();

DROP TRIGGER IF EXISTS task_links_edit_window ON public.task_links;
CREATE TRIGGER task_links_edit_window
  BEFORE UPDATE ON public.task_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_30min_edit_window();

DROP TRIGGER IF EXISTS task_action_items_edit_window ON public.task_action_items;
CREATE TRIGGER task_action_items_edit_window
  BEFORE UPDATE ON public.task_action_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_30min_edit_window();

-- 4. Petty-cash transaction balance trigger -------------------------------
CREATE OR REPLACE FUNCTION public.enforce_petty_cash_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE d numeric; c numeric;
BEGIN
  IF NEW.posted_at IS NOT NULL
     AND (OLD.posted_at IS NULL OR OLD.posted_at IS DISTINCT FROM NEW.posted_at) THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c
      FROM public.petty_cash_transaction_lines WHERE transaction_id = NEW.id;
    IF d <> c OR d = 0 THEN
      RAISE EXCEPTION 'Petty-cash transaction % is unbalanced (debit % vs credit %)', NEW.id, d, c;
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.enforce_petty_cash_balance() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='petty_cash_transactions' AND column_name='posted_at') THEN
    DROP TRIGGER IF EXISTS petty_cash_balance ON public.petty_cash_transactions;
    CREATE TRIGGER petty_cash_balance
      BEFORE UPDATE ON public.petty_cash_transactions
      FOR EACH ROW EXECUTE FUNCTION public.enforce_petty_cash_balance();
  END IF;
END $$;

-- 5. Drop legacy task_messages.open_point* columns ------------------------
-- First drop policies that reference these columns, then drop the columns,
-- then recreate the policies without the legacy checks.
DROP POLICY IF EXISTS "Firm members insert task_messages" ON public.task_messages;
DROP POLICY IF EXISTS "Authors update own messages within 30 min" ON public.task_messages;

ALTER TABLE public.task_messages
  DROP COLUMN IF EXISTS is_open_point,
  DROP COLUMN IF EXISTS open_point_status,
  DROP COLUMN IF EXISTS open_point_assignee_id,
  DROP COLUMN IF EXISTS open_point_done_at,
  DROP COLUMN IF EXISTS open_point_done_by;

CREATE POLICY "Firm members insert task_messages"
ON public.task_messages
FOR INSERT
WITH CHECK (
  author_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR (
      is_client_visible = true
      AND COALESCE(is_pinned, false) = false
      AND resolved_at IS NULL
      AND resolved_by IS NULL
      AND EXISTS (
        SELECT 1 FROM tasks t
        JOIN client_entities ce ON ce.id = t.entity_id
        JOIN projects p ON p.id = ce.project_id
        WHERE t.id = task_messages.task_id
          AND public.user_can_access_firm(p.firm_id)
      )
    )
  )
);

CREATE POLICY "Authors update own messages within 30 min"
ON public.task_messages
FOR UPDATE
USING (author_id = auth.uid() AND created_at > (now() - INTERVAL '30 minutes'))
WITH CHECK (
  author_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR (
      is_client_visible = true
      AND COALESCE(is_pinned, false) = false
      AND resolved_at IS NULL
      AND resolved_by IS NULL
    )
  )
);

-- 6. Conservative test-data cleanup ---------------------------------------
DELETE FROM public.page_perf_events WHERE created_at < now() - INTERVAL '30 days';
DELETE FROM public.client_error_log  WHERE created_at < now() - INTERVAL '90 days';
DELETE FROM public.otp_challenges    WHERE expires_at < now() - INTERVAL '7 days';
DELETE FROM public.invitations       WHERE expires_at < now() - INTERVAL '30 days' AND accepted_at IS NULL;
DELETE FROM public.task_messages     WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '30 days';
