-- Enable realtime on user_hub_permissions so that an admin toggling a user's
-- Hub Module Visibility pushes a change to that user's open session, applying
-- the new visibility within seconds without a reload.
--
-- REPLICA IDENTITY FULL ensures the old row (incl. user_id) is present on
-- DELETE/UPDATE events so the client-side `user_id=eq.<id>` filter matches.
ALTER TABLE public.user_hub_permissions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_hub_permissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_hub_permissions;
  END IF;
END
$$;
