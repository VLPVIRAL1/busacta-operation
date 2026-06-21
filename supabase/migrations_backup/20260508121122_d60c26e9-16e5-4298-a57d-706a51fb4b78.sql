-- Harden task_messages: enforce edit window, prevent un-delete, restrict client-visible flag
-- 1. Tighten the WITH CHECK on author insert: clients cannot mark their own message as client-visible.
DROP POLICY IF EXISTS "Authors insert messages" ON public.task_messages;
CREATE POLICY "Authors insert messages"
ON public.task_messages
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tasks t
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_messages.task_id
      AND public.user_can_access_firm(p.firm_id)
  )
  AND (
    -- Internal staff can set any visibility; clients must insert with is_client_visible = false
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'employee')
    OR is_client_visible = false
  )
);

-- 2. Trigger to enforce server-side edit policy for non-admin authors:
--    - cannot edit after 30 minutes
--    - cannot un-delete (clear deleted_at)
--    - cannot change is_client_visible flag
--    - cannot change author_id, task_id
CREATE OR REPLACE FUNCTION public.enforce_task_message_edit_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins bypass all edit restrictions.
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Immutable fields for everyone except admins.
  IF NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.task_id IS DISTINCT FROM OLD.task_id THEN
    RAISE EXCEPTION 'Cannot change author or task of a message';
  END IF;

  -- Only the author can update their own message (RLS already enforces this, defensive check).
  IF OLD.author_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the author can edit this message';
  END IF;

  -- Cannot un-delete a message (clear deleted_at once set).
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Cannot restore a deleted message';
  END IF;

  -- Authors cannot toggle the client-visible flag after creation.
  IF NEW.is_client_visible IS DISTINCT FROM OLD.is_client_visible THEN
    RAISE EXCEPTION 'Only an admin can change message visibility';
  END IF;

  -- Edit window: 30 minutes from creation for body changes.
  IF NEW.body IS DISTINCT FROM OLD.body
     AND OLD.created_at < (now() - INTERVAL '30 minutes') THEN
    RAISE EXCEPTION 'Edit window has expired (30 minutes)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_task_message_edit_policy_trg ON public.task_messages;
CREATE TRIGGER enforce_task_message_edit_policy_trg
BEFORE UPDATE ON public.task_messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_message_edit_policy();