
create table if not exists public.mfa_trusted_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  label text,
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.mfa_trusted_devices enable row level security;

drop policy if exists "trusted_devices_select_self" on public.mfa_trusted_devices;
create policy "trusted_devices_select_self"
  on public.mfa_trusted_devices for select
  using (user_id = auth.uid());

drop policy if exists "trusted_devices_delete_self" on public.mfa_trusted_devices;
create policy "trusted_devices_delete_self"
  on public.mfa_trusted_devices for delete
  using (user_id = auth.uid());

-- inserts go through register_trusted_device() (security definer) only
create or replace function public.register_trusted_device(
  _device_id text,
  _label text default null,
  _days int default 30,
  _ip inet default null,
  _ua text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if _device_id is null or length(_device_id) < 16 then
    raise exception 'invalid_device_id';
  end if;
  if _days is null or _days < 1 or _days > 90 then
    _days := 30;
  end if;
  insert into public.mfa_trusted_devices(user_id, device_id, label, last_used_at, expires_at, ip, user_agent)
  values (auth.uid(), _device_id, _label, now(), now() + make_interval(days => _days), _ip, _ua)
  on conflict (user_id, device_id) do update
    set last_used_at = now(),
        expires_at = now() + make_interval(days => _days),
        ip = coalesce(excluded.ip, public.mfa_trusted_devices.ip),
        user_agent = coalesce(excluded.user_agent, public.mfa_trusted_devices.user_agent),
        label = coalesce(excluded.label, public.mfa_trusted_devices.label);
end $$;

create or replace function public.is_trusted_device(_device_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare _ok boolean;
begin
  if auth.uid() is null or _device_id is null then return false; end if;
  select exists(
    select 1 from public.mfa_trusted_devices
    where user_id = auth.uid()
      and device_id = _device_id
      and expires_at > now()
  ) into _ok;
  if _ok then
    update public.mfa_trusted_devices
       set last_used_at = now()
     where user_id = auth.uid() and device_id = _device_id;
  end if;
  return coalesce(_ok, false);
end $$;

grant execute on function public.register_trusted_device(text,text,int,inet,text) to authenticated;
grant execute on function public.is_trusted_device(text) to authenticated;
