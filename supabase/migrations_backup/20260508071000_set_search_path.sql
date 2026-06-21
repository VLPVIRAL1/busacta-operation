-- Set session-level search_path so extension functions (gen_random_bytes, etc.)
-- are accessible without schema prefix in all subsequent migrations.
SET search_path TO "$user", public, extensions;
