-- B2: retry chain for employee import runs
alter table public.employee_import_runs
  add column if not exists parent_run_id uuid null references public.employee_import_runs(id) on delete set null;
create index if not exists employee_import_runs_parent_idx on public.employee_import_runs(parent_run_id);

-- C: invite throttling
alter table public.profiles
  add column if not exists last_invite_sent_at timestamptz null;

-- C: allow invite_sent in audit
alter table public.employee_audit drop constraint if exists employee_audit_action_check;
alter table public.employee_audit add constraint employee_audit_action_check
  check (action = any (array[
    'create','update','deactivate','reactivate','permissions_change',
    'portal_lockout_verified','portal_lockout_failed','imported','bulk_import_failed',
    'invite_sent','reports_to_changed'
  ]));

-- E1: hierarchy column
alter table public.profiles
  add column if not exists reports_to uuid null references public.profiles(id) on delete set null;
create index if not exists profiles_reports_to_idx on public.profiles(reports_to);

-- E1: cycle prevention trigger
create or replace function public.prevent_reporting_cycle()
returns trigger language plpgsql set search_path = public as $$
declare
  cursor_id uuid := new.reports_to;
  depth int := 0;
begin
  if new.reports_to is null then return new; end if;
  if new.reports_to = new.id then
    raise exception 'An employee cannot report to themselves';
  end if;
  while cursor_id is not null and depth < 100 loop
    if cursor_id = new.id then
      raise exception 'Circular reporting line detected';
    end if;
    select reports_to into cursor_id from public.profiles where id = cursor_id;
    depth := depth + 1;
  end loop;
  return new;
end $$;

drop trigger if exists profiles_prevent_cycle on public.profiles;
create trigger profiles_prevent_cycle
  before insert or update of reports_to on public.profiles
  for each row execute function public.prevent_reporting_cycle();

-- E1: hierarchy history
create table if not exists public.profiles_hierarchy_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  old_manager_id uuid null references public.profiles(id) on delete set null,
  new_manager_id uuid null references public.profiles(id) on delete set null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index if not exists profiles_hierarchy_history_employee_idx
  on public.profiles_hierarchy_history(employee_id, changed_at desc);

alter table public.profiles_hierarchy_history enable row level security;

drop policy if exists "hierarchy history read" on public.profiles_hierarchy_history;
create policy "hierarchy history read"
  on public.profiles_hierarchy_history for select
  to authenticated using (true);

drop policy if exists "hierarchy history write" on public.profiles_hierarchy_history;
create policy "hierarchy history write"
  on public.profiles_hierarchy_history for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'hr_manager'::app_role)
    or public.has_role(auth.uid(), 'super_admin'::app_role)
    or public.has_role(auth.uid(), 'admin'::app_role)
  );

-- E2: recursive org tree function
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
    union all
    select p.id, p.full_name, p.email, p.position_title, p.department,
           p.avatar_url, p.status, p.reports_to, t.depth + 1, t.path || p.id
    from public.profiles p
    join tree t on p.reports_to = t.id
    where not (p.id = any(t.path))
  )
  select * from tree order by depth, full_name nulls last;
$$;

grant execute on function public.get_org_tree() to authenticated;