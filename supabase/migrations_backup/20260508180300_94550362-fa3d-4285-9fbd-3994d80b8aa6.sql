grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to anon;
grant execute on function public.user_can_access_firm(uuid) to authenticated;
grant execute on function public.user_can_access_firm(uuid) to anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_role() to anon;
grant execute on function public.lookup_invitation(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;