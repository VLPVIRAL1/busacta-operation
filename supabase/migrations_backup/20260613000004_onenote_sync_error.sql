-- Track failed OneNote sync attempts per note so the bulk-backfill can retry them.
--
-- NULL  = never failed (note was never synced, or last sync succeeded).
-- TEXT  = last error message; cleared automatically on the next successful sync.
--
-- Combined with onenote_page_id IS NULL this gives the full set of "needs sync"
-- notes:  WHERE onenote_page_id IS NULL OR onenote_sync_error IS NOT NULL

ALTER TABLE public.daily_notes
  ADD COLUMN IF NOT EXISTS onenote_sync_error TEXT;
