
-- RLS-helper functions: only the database needs to call them inside RLS expressions.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.user_can_access_firm(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon, authenticated, public;

-- Invitation RPCs: only authenticated users should call them; anonymous must not.
REVOKE EXECUTE ON FUNCTION public.lookup_invitation(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lookup_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
