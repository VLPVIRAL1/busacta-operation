-- User-created Daily Notes templates (built-ins remain hardcoded in
-- src/components/global-dashboard/note-templates.ts).
create table if not exists daily_note_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  icon          text not null default '📄',
  description   text not null default '',
  default_title text not null default 'Untitled note',
  content_json  jsonb not null,
  sort_order    int not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists daily_note_templates_user_idx
  on daily_note_templates (user_id, sort_order);

alter table daily_note_templates enable row level security;

create policy "own_daily_note_templates_select" on daily_note_templates
  for select using (user_id = auth.uid());

create policy "own_daily_note_templates_insert" on daily_note_templates
  for insert with check (user_id = auth.uid());

create policy "own_daily_note_templates_update" on daily_note_templates
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own_daily_note_templates_delete" on daily_note_templates
  for delete using (user_id = auth.uid());

create or replace function _upd_daily_note_template_ts()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_daily_note_template_updated_at on daily_note_templates;
create trigger trg_daily_note_template_updated_at
  before update on daily_note_templates
  for each row execute function _upd_daily_note_template_ts();
