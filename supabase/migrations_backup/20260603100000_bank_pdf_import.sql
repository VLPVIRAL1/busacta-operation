-- Bank PDF / extended-format statement import.
--
-- Adds reference number + transaction-type-hint columns to bank_feed_lines
-- (extracted from PDF and CSV statements when present) and tracks the
-- originating PDF file path + detected bank profile on the import batch.
--
-- Backwards compatible: every column is nullable so existing Excel imports
-- continue to insert without change.

alter table public.bank_feed_lines
  add column if not exists reference_no text,
  add column if not exists txn_type_hint text;

comment on column public.bank_feed_lines.reference_no is
  'Bank-supplied reference / cheque / UTR number when present on the statement.';
comment on column public.bank_feed_lines.txn_type_hint is
  'Bank-supplied transaction type string (e.g. "UPI", "NEFT", "POS", "ATM"). Advisory only.';

create index if not exists bank_feed_lines_reference_no_idx
  on public.bank_feed_lines (account_id, reference_no)
  where reference_no is not null;

alter table public.bank_import_batches
  add column if not exists source_format text,        -- 'xlsx' | 'csv' | 'pdf'
  add column if not exists bank_profile_id text,      -- 'hdfc' | 'icici' | 'sbi' | 'axis' | 'kotak' | 'au' | 'boi' | null
  add column if not exists file_path text,            -- supabase storage path of the original file
  add column if not exists imported_rows_count int,   -- net inserted (excludes duplicates)
  add column if not exists notes text;

comment on column public.bank_import_batches.source_format is
  'Origin of the import: xlsx, csv, or pdf. Used for audit + UI badges.';
comment on column public.bank_import_batches.bank_profile_id is
  'Profile auto-detected from the file (e.g. hdfc). Null when generic mapping was used.';
comment on column public.bank_import_batches.file_path is
  'Path to the original uploaded file in the bank-statements storage bucket.';

-- Storage bucket for original PDF / Excel statements. Private; access is via
-- signed URLs gated by the firm's existing bank_accounts RLS.
insert into storage.buckets (id, name, public)
  values ('bank-statements', 'bank-statements', false)
  on conflict (id) do nothing;

-- Storage policies: a user can read/write objects under their firm's accounts.
-- Path convention used by the client: {firm_id}/{account_id}/{batch_id}-{filename}
-- so we can authorize based on the first path segment.

drop policy if exists "bank-statements firm read" on storage.objects;
create policy "bank-statements firm read"
  on storage.objects for select
  using (
    bucket_id = 'bank-statements'
    and exists (
      select 1 from public.bank_accounts ba
      where ba.id::text = (storage.foldername(name))[2]
        and public.user_can_access_firm(ba.firm_id)
    )
  );

drop policy if exists "bank-statements firm write" on storage.objects;
create policy "bank-statements firm write"
  on storage.objects for insert
  with check (
    bucket_id = 'bank-statements'
    and exists (
      select 1 from public.bank_accounts ba
      where ba.id::text = (storage.foldername(name))[2]
        and public.user_can_access_firm(ba.firm_id)
    )
  );

drop policy if exists "bank-statements firm delete" on storage.objects;
create policy "bank-statements firm delete"
  on storage.objects for delete
  using (
    bucket_id = 'bank-statements'
    and exists (
      select 1 from public.bank_accounts ba
      where ba.id::text = (storage.foldername(name))[2]
        and public.user_can_access_firm(ba.firm_id)
    )
  );
