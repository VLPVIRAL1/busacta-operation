ALTER TABLE public.organizer_deployments
  ADD COLUMN anon_session_token UUID;

CREATE UNIQUE INDEX idx_organizer_deployments_anon_session_token
  ON public.organizer_deployments(anon_session_token)
  WHERE anon_session_token IS NOT NULL;