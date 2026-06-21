-- Fix: Employee Hierarchy should only list HR-managed employees, not clients.
--
-- Direct clients are stored in public.profiles (role 'client',
-- provisioned_via 'direct_client_hub') with reports_to = null. The previous
-- get_org_tree() anchored its recursion on every profile where
-- reports_to IS NULL, so newly created direct clients showed up as root nodes
-- in the org chart.
--
-- Redefine get_org_tree() to exclude any profile that holds the 'client' role,
-- in both the root anchor and the recursive step. This covers direct-client-hub
-- and self-signup clients alike, and keeps a client from ever appearing in the
-- tree even if a reports_to value is set.

create or replace function public.get_org_tree()
returns table(
  id uuid,
  full_name text,
  email text,
  position_title text,
  department text,
  avatar_url text,
  status text,
  reports_to uuid,
  depth int,
  path uuid[]
)
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select p.id, p.full_name, p.email, p.position_title, p.department,
           p.avatar_url, p.status, p.reports_to, 1 as depth, array[p.id] as path
    from public.profiles p
    where p.reports_to is null
      and not public.has_role(p.id, 'client'::app_role)
    union all
    select p.id, p.full_name, p.email, p.position_title, p.department,
           p.avatar_url, p.status, p.reports_to, t.depth + 1, t.path || p.id
    from public.profiles p
    join tree t on p.reports_to = t.id
    where not (p.id = any(t.path))
      and not public.has_role(p.id, 'client'::app_role)
  )
  select * from tree order by depth, full_name nulls last;
$$;

revoke execute on function public.get_org_tree() from public, anon;
grant execute on function public.get_org_tree() to authenticated;
