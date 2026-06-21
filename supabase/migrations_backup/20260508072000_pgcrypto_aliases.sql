-- Public-schema wrappers for pgcrypto functions so they resolve without
-- schema prefix in all subsequent migrations (extensions schema not in
-- default search_path for the migration runner role).
CREATE OR REPLACE FUNCTION public.gen_random_bytes(integer)
  RETURNS bytea LANGUAGE sql AS $$ SELECT extensions.gen_random_bytes($1) $$;
