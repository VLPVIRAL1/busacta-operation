-- Lock down EXECUTE on SECURITY DEFINER functions: revoke from PUBLIC, grant only to authenticated roles where appropriate.
-- Trigger-only functions (called via trigger context, not by clients) get EXECUTE revoked entirely.

-- Trigger-only functions: revoke EXECUTE from PUBLIC and authenticated/anon
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.task_message_audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.task_audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_single_open_timer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_task_message_edit_policy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- RLS-helper / auth-helper functions: must remain callable by authenticated users (used inside RLS policies and app code)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.user_can_access_firm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_firm(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- Invitation functions: lookup is intentionally callable without auth (token-based);
-- accept requires an authenticated session.
REVOKE ALL ON FUNCTION public.lookup_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_invitation(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
