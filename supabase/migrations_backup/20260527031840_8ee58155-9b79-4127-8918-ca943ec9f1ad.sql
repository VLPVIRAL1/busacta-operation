-- Restrict vendor reads to internal staff only (clients should not see tax_id/contact)
DROP POLICY IF EXISTS "Staff read vendors" ON public.vendors;
CREATE POLICY "Internal staff read vendors"
  ON public.vendors
  FOR SELECT
  TO authenticated
  USING (public.is_internal_user_id(auth.uid()));

-- Restrict organizer_blocks reads to managers only.
-- Respondents never query the blocks table directly from the browser; the
-- public organizer endpoints use the admin client which bypasses RLS, so
-- this does not break exam-taking flows. It does prevent authenticated
-- users from reading scoring_json (answer keys) before submission.
DROP POLICY IF EXISTS "Blocks: view by authenticated" ON public.organizer_blocks;
CREATE POLICY "Blocks: managers can view"
  ON public.organizer_blocks
  FOR SELECT
  TO authenticated
  USING (public.can_manage_organizer(auth.uid()));