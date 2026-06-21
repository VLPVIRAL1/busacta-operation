-- m365_upn was added in 20260613000001_onenote_sync.sql but is never read or
-- written by the application. The OneNote integration uses site-scoped Graph
-- endpoints (/sites/{id}/onenote/...) with app-only auth, so no UPN is needed.
-- Dropping the column removes dead schema that would mislead future developers.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS m365_upn;
