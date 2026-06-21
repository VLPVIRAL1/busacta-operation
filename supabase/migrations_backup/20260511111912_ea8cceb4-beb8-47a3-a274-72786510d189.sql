DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND firm_id IS NOT DISTINCT FROM (SELECT firm_id FROM public.profiles WHERE id = auth.uid())
  );