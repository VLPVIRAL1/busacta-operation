-- Leave Policy Templates: named, reusable policy definitions
create table if not exists leave_policy_templates (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  policy_year           int  not null check (policy_year between 2020 and 2100),
  el_quota              numeric(6,2) not null default 18,
  cl_quota              numeric(6,2) not null default 12,
  sl_quota              numeric(6,2) not null default 12,
  el_carry_forward_max  numeric(6,2) not null default 0,
  cl_carry_forward_max  numeric(6,2) not null default 0,
  sl_carry_forward_max  numeric(6,2) not null default 0,
  opening_balance_date  date,
  el_opening_balance    numeric(6,2) not null default 0,
  cl_opening_balance    numeric(6,2) not null default 0,
  sl_opening_balance    numeric(6,2) not null default 0,
  created_by            uuid references profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (name, policy_year)
);

alter table leave_policy_templates enable row level security;

create policy "payroll_mgrs_leave_templates" on leave_policy_templates
  for all using (
    current_user_role() in ('super_admin','admin','hr_manager','finance_manager')
  );

-- Assignments: one template per employee per year
create table if not exists leave_policy_assignments (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references leave_policy_templates(id) on delete cascade,
  employee_id uuid not null references profiles(id) on delete cascade,
  policy_year int  not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references profiles(id),
  unique (employee_id, policy_year)
);

alter table leave_policy_assignments enable row level security;

create policy "payroll_mgrs_leave_assignments" on leave_policy_assignments
  for all using (
    current_user_role() in ('super_admin','admin','hr_manager','finance_manager')
  );

create or replace function _upd_leave_template_ts()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_leave_template_updated_at
  before update on leave_policy_templates
  for each row execute function _upd_leave_template_ts();
