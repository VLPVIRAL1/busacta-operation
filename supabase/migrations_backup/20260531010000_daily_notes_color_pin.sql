-- Daily Notes: per-note color + pinning
-- Adds an optional palette key (e.g. 'amber', 'rose') and a pin flag so users
-- can colour-code notes and keep favourites at the top of the list.

ALTER TABLE public.daily_notes
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- Surface pinned notes first within a month without an extra sort pass.
CREATE INDEX IF NOT EXISTS idx_daily_notes_owner_pinned
  ON public.daily_notes(owner_id, is_pinned, note_date DESC);
