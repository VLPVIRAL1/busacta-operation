
-- 1. Settings table
create table if not exists public.company_hr_settings (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true,
  standard_start_time time not null default '09:00',
  grace_period_minutes int not null default 15,
  standard_end_time time not null default '18:00',
  early_checkout_grace_minutes int not null default 0,
  min_hours_full_day numeric(4,2) not null default 8.0,
  min_hours_half_day numeric(4,2) not null default 4.0,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_hr_settings_one_active
  on public.company_hr_settings (is_active) where is_active = true;

alter table public.company_hr_settings enable row level security;

create policy "Auth read hr settings" on public.company_hr_settings
  for select to authenticated using (true);
create policy "Admins manage hr settings" on public.company_hr_settings
  for all to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'super_admin'))
  with check (has_role(auth.uid(),'admin') or has_role(auth.uid(),'super_admin'));

create trigger trg_hr_settings_updated_at
  before update on public.company_hr_settings
  for each row execute function public.update_updated_at_column();

insert into public.company_hr_settings (is_active) values (true)
  on conflict do nothing;

-- 2. Attendance logs table
create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  employee_code text,
  employee_name text not null,
  department text,
  designation text,
  entry_date date not null,
  day_of_week text,
  punch_in timestamptz,
  punch_out timestamptz,
  raw_total_hours text,
  raw_break text,
  raw_status text,
  total_minutes_in_office int not null default 0,
  auto_status text not null default 'absent' check (auto_status in ('present','half_day','absent')),
  is_late_arrival boolean not null default false,
  is_early_checkout boolean not null default false,
  late_by_minutes int not null default 0,
  early_by_minutes int not null default 0,
  applied_settings_id uuid references public.company_hr_settings(id),
  import_batch_id uuid,
  matched_employee_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_logs_date on public.attendance_logs(entry_date);
create index if not exists idx_attendance_logs_employee on public.attendance_logs(employee_code);
create index if not exists idx_attendance_logs_late on public.attendance_logs(is_late_arrival) where is_late_arrival = true;
create index if not exists idx_attendance_logs_early on public.attendance_logs(is_early_checkout) where is_early_checkout = true;

alter table public.attendance_logs enable row level security;

create policy "Staff read attendance_logs"
  on public.attendance_logs for select to authenticated
  using (
    has_role(auth.uid(),'admin')
    or has_role(auth.uid(),'super_admin')
    or has_role(auth.uid(),'hr_manager')
    or matched_employee_id = auth.uid()
  );

create policy "HR manage attendance_logs - insert"
  on public.attendance_logs for insert to authenticated
  with check (
    has_role(auth.uid(),'admin')
    or has_role(auth.uid(),'super_admin')
    or has_role(auth.uid(),'hr_manager')
  );

create policy "HR manage attendance_logs - update"
  on public.attendance_logs for update to authenticated
  using (
    has_role(auth.uid(),'admin')
    or has_role(auth.uid(),'super_admin')
    or has_role(auth.uid(),'hr_manager')
  );

create policy "HR manage attendance_logs - delete"
  on public.attendance_logs for delete to authenticated
  using (
    has_role(auth.uid(),'admin')
    or has_role(auth.uid(),'super_admin')
    or has_role(auth.uid(),'hr_manager')
  );
