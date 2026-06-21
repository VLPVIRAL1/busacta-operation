-- Bootstrap required Postgres extensions before any schema migrations.
-- All IF NOT EXISTS guards make this safe to apply to existing projects.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Ensure extensions schema is in search_path so extension functions are
-- accessible without schema-prefix (e.g. gen_random_bytes, uuid_generate_v4).
ALTER DATABASE postgres SET search_path TO "$user", public, extensions;
