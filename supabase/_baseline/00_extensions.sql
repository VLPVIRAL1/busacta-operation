-- ============================================================
-- 00 · Extensions
-- Enable the extensions the schema depends on. On Supabase these are allow-listed.
-- ============================================================
create extension if not exists "uuid-ossp"          with schema extensions;
create extension if not exists "pgcrypto"            with schema extensions;
create extension if not exists "pg_trgm"             with schema extensions;
create extension if not exists "unaccent"            with schema extensions;
create extension if not exists "vector"             with schema extensions;
create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "btree_gist"         with schema public;
create extension if not exists "pg_net"             with schema public;   -- HTTP calls used by cron jobs
create extension if not exists "pg_cron";            -- installs into pg_catalog; required for scheduled jobs
-- supabase_vault is pre-installed & managed by Supabase (vault schema) — no action needed.
