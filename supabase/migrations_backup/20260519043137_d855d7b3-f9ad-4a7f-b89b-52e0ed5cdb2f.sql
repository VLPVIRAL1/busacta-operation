revoke execute on function public.get_org_tree() from public, anon;
grant execute on function public.get_org_tree() to authenticated;
revoke execute on function public.prevent_reporting_cycle() from public, anon;