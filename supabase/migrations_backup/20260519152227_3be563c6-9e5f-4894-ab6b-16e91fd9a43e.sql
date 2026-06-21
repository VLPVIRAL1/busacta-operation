CREATE OR REPLACE FUNCTION public.increment_public_link_submission(link_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.organizer_public_links
  SET submission_count = submission_count + 1,
      updated_at = now()
  WHERE id = link_id;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_public_link_submission(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_public_link_submission(UUID) TO service_role;