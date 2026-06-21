-- ML Detection (local Naive Bayes) + Gemini 2.5 Flash bootstrap.
-- Adds training-text capture, a model store, Gemini usage/cost tracking,
-- and per-doc-type Gemini controls. Layer 4 of the categorisation engine.

---------------------------------------------------------------------
-- 1. Training text + Gemini metadata on doc_categorisation_results
---------------------------------------------------------------------
alter table doc_categorisation_results
  add column if not exists segment_text         text         default null,
  add column if not exists gemini_input_tokens  integer      default null,
  add column if not exists gemini_output_tokens integer      default null,
  add column if not exists gemini_model         varchar(50)  default null,
  add column if not exists gemini_cost_usd      numeric(10,6) default null;

-- status is a VARCHAR + inline CHECK (auto-named), not a pg enum.
-- Drop the auto-named constraint and re-add a named one with 'gemini_labelled'.
alter table doc_categorisation_results
  drop constraint if exists doc_categorisation_results_status_check;
alter table doc_categorisation_results
  add constraint doc_categorisation_results_status_check
  check (status in (
    'auto', 'confirmed', 'overridden', 'needs_review', 'manual', 'gemini_labelled'
  ));

-- Partial index for the training-corpus query (rows with usable labeled text).
create index if not exists idx_cat_results_training
  on doc_categorisation_results (doc_type)
  where segment_text is not null;

---------------------------------------------------------------------
-- 2. categorisation_config — Gemini control columns
---------------------------------------------------------------------
alter table categorisation_config
  add column if not exists gemini_enabled        boolean  not null default true,
  add column if not exists gemini_bootstrap_done boolean  not null default false,
  add column if not exists gemini_sample_target  smallint not null default 50
    check (gemini_sample_target between 10 and 500);

---------------------------------------------------------------------
-- 3. categorisation_ml_model — serialized Naive Bayes model store
---------------------------------------------------------------------
create table if not exists categorisation_ml_model (
  id               uuid        primary key default gen_random_uuid(),
  model_json       jsonb       not null,
  vocab_size       integer     not null default 0,
  sample_count     integer     not null default 0,
  per_class_counts jsonb       not null default '{}'::jsonb,
  trained_at       timestamptz not null default now(),
  is_active        boolean     not null default true
);

-- At most one active model at a time.
create unique index if not exists idx_cat_model_active
  on categorisation_ml_model (is_active) where is_active = true;

alter table categorisation_ml_model enable row level security;

create policy "cat_model_read" on categorisation_ml_model
  for select using (auth.role() = 'authenticated');
-- Writes happen via service role (training server function). No write policy.

---------------------------------------------------------------------
-- 4. gemini_usage_log — one row per Gemini API call (cost source of truth)
---------------------------------------------------------------------
create table if not exists gemini_usage_log (
  id              uuid          primary key default gen_random_uuid(),
  org_id          uuid          default null,
  doc_id          uuid          references task_attachments(id) on delete set null,
  result_id       uuid          references doc_categorisation_results(id) on delete set null,
  call_purpose    varchar(30)   not null
                    check (call_purpose in ('ocr','classify','ocr+classify','bootstrap','verify')),
  gemini_model    varchar(50)   not null default 'gemini-2.5-flash',
  input_tokens    integer       not null default 0,
  output_tokens   integer       not null default 0,
  cost_usd        numeric(10,6) not null default 0,
  tier            varchar(10)   not null default 'free'
                    check (tier in ('free','paid')),
  doc_type_result varchar(50),
  latency_ms      integer,
  error_code      varchar(50),
  called_at       timestamptz   not null default now()
);

create index if not exists idx_gemini_log_org     on gemini_usage_log (org_id, called_at desc);
create index if not exists idx_gemini_log_doc     on gemini_usage_log (doc_id);
create index if not exists idx_gemini_log_purpose on gemini_usage_log (call_purpose);
create index if not exists idx_gemini_log_date    on gemini_usage_log (called_at desc);

alter table gemini_usage_log enable row level security;

-- Cost data: admin / super_admin read only. Writes via service role only.
create policy "gemini_log_read" on gemini_usage_log
  for select using (current_user_role() in ('super_admin', 'admin'));

---------------------------------------------------------------------
-- 5. gemini_usage_daily — pre-aggregated rollup for dashboards
---------------------------------------------------------------------
create table if not exists gemini_usage_daily (
  id                  uuid    primary key default gen_random_uuid(),
  org_id              uuid    default null,
  date                date    not null,
  model               varchar(50) not null,
  tier                varchar(10) not null,
  total_calls         integer not null default 0,
  total_input_tokens  bigint  not null default 0,
  total_output_tokens bigint  not null default 0,
  total_cost_usd      numeric(10,4) not null default 0,
  error_count         integer not null default 0,
  unique (org_id, date, model, tier)
);

-- org_id is nullable; the unique constraint above treats NULLs as distinct in
-- Postgres, so coalesce in the rollup to a sentinel for a stable upsert key.
create unique index if not exists idx_gemini_daily_key
  on gemini_usage_daily (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), date, model, tier);

alter table gemini_usage_daily enable row level security;

create policy "gemini_daily_read" on gemini_usage_daily
  for select using (current_user_role() in ('super_admin', 'admin'));

---------------------------------------------------------------------
-- 6. RPC: rpc_update_gemini_daily_rollup — upsert/increment daily counters
---------------------------------------------------------------------
create or replace function rpc_update_gemini_daily_rollup(
  p_org_id        uuid,
  p_model         varchar,
  p_tier          varchar,
  p_calls         integer,
  p_input_tokens  bigint,
  p_output_tokens bigint,
  p_cost          numeric,
  p_errors        integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into gemini_usage_daily
    (org_id, date, model, tier, total_calls,
     total_input_tokens, total_output_tokens, total_cost_usd, error_count)
  values
    (p_org_id, current_date, p_model, p_tier, p_calls,
     p_input_tokens, p_output_tokens, p_cost, p_errors)
  on conflict (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), date, model, tier)
  do update set
    total_calls         = gemini_usage_daily.total_calls + excluded.total_calls,
    total_input_tokens  = gemini_usage_daily.total_input_tokens + excluded.total_input_tokens,
    total_output_tokens = gemini_usage_daily.total_output_tokens + excluded.total_output_tokens,
    total_cost_usd      = gemini_usage_daily.total_cost_usd + excluded.total_cost_usd,
    error_count         = gemini_usage_daily.error_count + excluded.error_count;
end;
$$;

-- The rollup RPC mutates usage/cost counters and must only be invoked by the
-- Edge Function (service role). Revoke the default PUBLIC + anon/authenticated
-- execute grants (Supabase grants these on new functions) so signed-in users
-- cannot inflate cost metrics.
revoke execute on function public.rpc_update_gemini_daily_rollup(
  uuid, varchar, varchar, integer, bigint, bigint, numeric, integer
) from public, anon, authenticated;

grant execute on function public.rpc_update_gemini_daily_rollup(
  uuid, varchar, varchar, integer, bigint, bigint, numeric, integer
) to service_role;
