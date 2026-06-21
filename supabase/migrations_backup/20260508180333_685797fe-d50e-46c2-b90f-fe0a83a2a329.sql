revoke execute on function public.has_role(uuid, public.app_role) from anon;
revoke execute on function public.user_can_access_firm(uuid) from anon;
revoke execute on function public.current_user_role() from anon;
revoke execute on function public.lookup_invitation(text) from anon;
revoke execute on function public.accept_invitation(text) from anon;