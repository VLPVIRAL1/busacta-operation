
-- E-Signature module — Phase 1 foundation

-- 1. Enums
create type public.esign_envelope_status as enum
  ('draft','sent','in_progress','completed','declined','voided','expired');
create type public.esign_routing_mode as enum ('parallel','sequential');
create type public.esign_recipient_role as enum ('signer','approver','viewer','cc');
create type public.esign_auth_method as enum ('email_link','sms_otp','access_code');
create type public.esign_recipient_status as enum
  ('pending','notified','viewed','consented','authenticated','completed','declined');
create type public.esign_field_type as enum
  ('signature','initials','text','checkbox','radio','date_signed',
   'name','email','company','title','attachment');
create type public.esign_event as enum
  ('envelope_created','envelope_sent','envelope_voided','envelope_expired',
   'envelope_completed','recipient_notified','recipient_reminded',
   'auth_challenged','auth_passed','auth_failed',
   'consent_accepted','document_viewed','field_filled','signature_applied',
   'recipient_completed','recipient_declined','certificate_generated',
   'verification_scanned');

-- 2. Envelopes
create table public.esign_envelopes (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references public.firms(id) on delete restrict,
  project_id      uuid references public.projects(id),
  title           text not null,
  message         text,
  status          public.esign_envelope_status not null default 'draft',
  routing_mode    public.esign_routing_mode not null default 'sequential',
  current_node    int not null default 1,
  expires_at      timestamptz not null default (now() + interval '30 days'),
  reminder_cadence_hours int not null default 48,
  last_reminder_at timestamptz,
  envelope_secret bytea not null default gen_random_bytes(32),
  branding_json   jsonb not null default '{}'::jsonb,
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  voided_at       timestamptz,
  void_reason     text
);
create index esign_envelopes_firm_status_idx on public.esign_envelopes(firm_id, status, expires_at);

-- 3. Documents
create table public.esign_documents (
  id              uuid primary key default gen_random_uuid(),
  envelope_id     uuid not null references public.esign_envelopes(id) on delete cascade,
  name            text not null,
  source_mime     text not null,
  source_path     text not null,
  flattened_path  text,
  page_count      int,
  width_pt        numeric,
  height_pt       numeric,
  order_index     int not null default 0,
  created_at      timestamptz not null default now()
);
create index esign_documents_envelope_idx on public.esign_documents(envelope_id, order_index);

-- 4. Recipients
create table public.esign_recipients (
  id              uuid primary key default gen_random_uuid(),
  envelope_id     uuid not null references public.esign_envelopes(id) on delete cascade,
  routing_order   int not null default 1,
  role            public.esign_recipient_role not null default 'signer',
  full_name       text not null,
  email           text not null,
  phone_e164      text,
  auth_method     public.esign_auth_method not null default 'email_link',
  access_code_hash text,
  color_hex       text not null default '#4f46e5',
  status          public.esign_recipient_status not null default 'pending',
  access_token_hash text,
  token_expires_at timestamptz,
  notified_at     timestamptz,
  viewed_at       timestamptz,
  consented_at    timestamptz,
  completed_at    timestamptz,
  decline_reason  text,
  created_at      timestamptz not null default now()
);
create index esign_recipients_envelope_idx on public.esign_recipients(envelope_id, routing_order);

-- 5. Fields
create table public.esign_fields (
  id              uuid primary key default gen_random_uuid(),
  envelope_id     uuid not null references public.esign_envelopes(id) on delete cascade,
  recipient_id    uuid not null references public.esign_recipients(id) on delete cascade,
  document_id     uuid not null references public.esign_documents(id) on delete cascade,
  field_type      public.esign_field_type not null,
  page_index      int not null default 0,
  x_pt            numeric not null,
  y_pt            numeric not null,
  width_pt        numeric not null,
  height_pt       numeric not null,
  is_required     boolean not null default true,
  default_value   text,
  variable_token  text,
  options_json    jsonb,
  conditional_json jsonb,
  group_key       text,
  tab_order       int,
  created_at      timestamptz not null default now()
);
create index esign_fields_envelope_idx on public.esign_fields(envelope_id, recipient_id);

-- 6. Field values
create table public.esign_field_values (
  id              uuid primary key default gen_random_uuid(),
  field_id        uuid not null unique references public.esign_fields(id) on delete cascade,
  envelope_id     uuid not null references public.esign_envelopes(id) on delete cascade,
  recipient_id    uuid not null references public.esign_recipients(id),
  value_text      text,
  value_image_path text,
  signed_at       timestamptz not null default now(),
  ip              inet,
  user_agent      text
);

-- 7. Audit log (append-only)
create table public.esign_audit_log (
  id              uuid primary key default gen_random_uuid(),
  envelope_id     uuid not null references public.esign_envelopes(id) on delete cascade,
  recipient_id    uuid references public.esign_recipients(id),
  event           public.esign_event not null,
  occurred_at     timestamptz not null default now(),
  actor_email     text,
  actor_phone     text,
  ip              inet,
  user_agent      text,
  geo_country     text,
  geo_region      text,
  geo_city        text,
  metadata_json   jsonb not null default '{}'::jsonb
);
create index esign_audit_log_envelope_idx on public.esign_audit_log(envelope_id, occurred_at);

create or replace function public.esign_audit_block_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'esign_audit_log is append-only: % not permitted', tg_op;
end $$;

create trigger esign_audit_no_update before update on public.esign_audit_log
  for each row execute function public.esign_audit_block_mutation();
create trigger esign_audit_no_delete before delete on public.esign_audit_log
  for each row execute function public.esign_audit_block_mutation();

-- 8. Completed documents
create table public.esign_completed_documents (
  envelope_id     uuid primary key references public.esign_envelopes(id) on delete cascade,
  sealed_pdf_path text not null,
  certificate_pdf_path text not null,
  sha256_hex      text not null,
  signature_algo  text not null default 'RSA-SHA256',
  cert_subject    text,
  cert_issuer     text,
  cert_serial     text,
  signed_at       timestamptz not null default now(),
  verification_slug text not null unique
);

-- 9. Templates
create table public.esign_templates (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references public.firms(id) on delete cascade,
  name            text not null,
  doc_kind        text,
  field_layout_json jsonb not null default '{}'::jsonb,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index esign_templates_firm_idx on public.esign_templates(firm_id);

-- 10. updated_at trigger
create trigger esign_envelopes_updated_at before update on public.esign_envelopes
  for each row execute function public.update_updated_at_column();

-- 11. RLS
alter table public.esign_envelopes enable row level security;
alter table public.esign_documents enable row level security;
alter table public.esign_recipients enable row level security;
alter table public.esign_fields enable row level security;
alter table public.esign_field_values enable row level security;
alter table public.esign_audit_log enable row level security;
alter table public.esign_completed_documents enable row level security;
alter table public.esign_templates enable row level security;

-- Helper: caller can manage e-sign for a firm
create or replace function public.can_manage_esign(_firm_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.firm_member_can(_firm_id, 'esign.manage')
$$;

-- Envelopes
create policy "esign_envelopes_select" on public.esign_envelopes
  for select using (public.can_manage_esign(firm_id));
create policy "esign_envelopes_insert" on public.esign_envelopes
  for insert with check (public.can_manage_esign(firm_id));
create policy "esign_envelopes_update" on public.esign_envelopes
  for update using (public.can_manage_esign(firm_id));
create policy "esign_envelopes_delete" on public.esign_envelopes
  for delete using (public.can_manage_esign(firm_id));

-- Helper: envelope belongs to a firm the caller can manage
create or replace function public.can_manage_esign_envelope(_envelope_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.esign_envelopes e
    where e.id = _envelope_id and public.can_manage_esign(e.firm_id)
  )
$$;

-- Cascade child tables through the helper
create policy "esign_documents_all" on public.esign_documents
  for all using (public.can_manage_esign_envelope(envelope_id))
  with check (public.can_manage_esign_envelope(envelope_id));

create policy "esign_recipients_all" on public.esign_recipients
  for all using (public.can_manage_esign_envelope(envelope_id))
  with check (public.can_manage_esign_envelope(envelope_id));

create policy "esign_fields_all" on public.esign_fields
  for all using (public.can_manage_esign_envelope(envelope_id))
  with check (public.can_manage_esign_envelope(envelope_id));

create policy "esign_field_values_select" on public.esign_field_values
  for select using (public.can_manage_esign_envelope(envelope_id));
-- writes only via SECURITY DEFINER server fns; no insert/update/delete policies

create policy "esign_audit_log_select" on public.esign_audit_log
  for select using (public.can_manage_esign_envelope(envelope_id));
-- inserts only via SECURITY DEFINER

create policy "esign_completed_documents_select" on public.esign_completed_documents
  for select using (public.can_manage_esign_envelope(envelope_id));

create policy "esign_templates_all" on public.esign_templates
  for all using (public.can_manage_esign(firm_id))
  with check (public.can_manage_esign(firm_id));

-- 12. Storage buckets (all private)
insert into storage.buckets (id, name, public) values
  ('esign-source','esign-source', false),
  ('esign-signed','esign-signed', false),
  ('esign-signatures','esign-signatures', false)
on conflict (id) do nothing;

-- Storage policies: only authenticated internal users (admin/super_admin/finance_manager) may access
create policy "esign_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id in ('esign-source','esign-signed','esign-signatures')
    and (
      public.has_role(auth.uid(),'super_admin')
      or public.has_role(auth.uid(),'admin')
      or public.has_role(auth.uid(),'finance_manager')
    )
  );

create policy "esign_storage_write" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('esign-source','esign-signed','esign-signatures')
    and (
      public.has_role(auth.uid(),'super_admin')
      or public.has_role(auth.uid(),'admin')
      or public.has_role(auth.uid(),'finance_manager')
    )
  );

create policy "esign_storage_update" on storage.objects for update to authenticated
  using (
    bucket_id in ('esign-source','esign-signed','esign-signatures')
    and (
      public.has_role(auth.uid(),'super_admin')
      or public.has_role(auth.uid(),'admin')
      or public.has_role(auth.uid(),'finance_manager')
    )
  );

create policy "esign_storage_delete" on storage.objects for delete to authenticated
  using (
    bucket_id in ('esign-source','esign-signed','esign-signatures')
    and (
      public.has_role(auth.uid(),'super_admin')
      or public.has_role(auth.uid(),'admin')
      or public.has_role(auth.uid(),'finance_manager')
    )
  );
