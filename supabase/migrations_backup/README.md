# migrations_backup

This folder contains the **291 historical Supabase migration files** that were squashed on 2026-06-21.

They represent the full incremental history from project inception through the finance/petty-cash/internal module teardown (`remove_finance_petty_internal_modules`).

## Why they were archived

The project adopted a single-file baseline schema (`supabase/migrations/00000000000000_baseline_schema.sql`) to make standing up fresh Supabase projects (test servers, production launch) trivially easy. The historical migrations are kept here for audit reference but are **not applied** when creating a new database.

## How the baseline was produced

1. `supabase/_baseline/00_extensions.sql` — 10 extensions (generated from pg_extension catalog)
2. `supabase/_baseline/01_public.sql` — public schema dump via `supabase db dump --linked -s public`
3. `supabase/_baseline/02_storage_buckets.sql` — 13 storage bucket inserts
4. `supabase/_baseline/02b_storage_policies.sql` — 33 storage.objects RLS policies
5. `supabase/_baseline/03_cron.sql` — 3 pg_cron jobs

These were concatenated in order into `supabase/migrations/00000000000000_baseline_schema.sql`.

## Creating a fresh database from the baseline

```bash
# Option A — Supabase CLI (recommended)
supabase link --project-ref <new-project-ref>
supabase db push

# Option B — SQL Editor
# Paste supabase/migrations/00000000000000_baseline_schema.sql
# into the SQL Editor of the new Supabase project and run.
```

## Do not re-apply these files

The historical migrations must **not** be re-applied to any database that was initialized from the baseline — they would conflict with already-existing objects.
