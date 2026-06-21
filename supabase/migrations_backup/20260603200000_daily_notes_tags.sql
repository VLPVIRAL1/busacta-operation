-- Daily Notes: per-note tags
-- Adds a free-form text[] of tags so users can label notes (#meeting,
-- #client, #urgent, etc.) and filter the sidebar. RLS already protects rows
-- through owner_id / shares, so no extra policies are needed.

ALTER TABLE public.daily_notes
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- GIN index supports `tags && ARRAY[...]` and `? 'tag'`-style lookups for the
-- filter chips in the left rail.
CREATE INDEX IF NOT EXISTS idx_daily_notes_tags
  ON public.daily_notes USING gin (tags);
