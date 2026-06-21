-- OneNote sync columns
-- profiles: per-employee notebook config + M365 UPN (app-only auth needs /users/{upn}/onenote/...)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onenote_notebook_id  TEXT,
  ADD COLUMN IF NOT EXISTS onenote_notebook_url TEXT,
  ADD COLUMN IF NOT EXISTS m365_upn             TEXT;

-- daily_notes: store page ID so subsequent syncs PATCH instead of creating duplicates
ALTER TABLE public.daily_notes
  ADD COLUMN IF NOT EXISTS onenote_page_id TEXT;
