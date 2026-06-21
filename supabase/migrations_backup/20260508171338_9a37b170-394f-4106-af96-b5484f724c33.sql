
-- Add pinning support to notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS notifications_user_pin_idx ON public.notifications(user_id, is_pinned, created_at DESC);

-- Lock down SECURITY DEFINER trigger / internal-only helper functions so anon/authenticated cannot call them via RPC.
-- Keep RLS-helper functions executable (has_role, user_can_access_firm, current_user_role, lookup_invitation, accept_invitation).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.task_audit_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.task_message_audit_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_task_message_edit_policy() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_single_open_timer() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.renumber_subtask_sort_order(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_task_subtasks_normalize() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_task_subtasks_default_sort() FROM anon, authenticated, public;
