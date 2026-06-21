-- Fix 1: Restrict esign-source/esign-signed/esign-signatures storage to firm-scoped envelope managers
DROP POLICY IF EXISTS esign_storage_read ON storage.objects;
DROP POLICY IF EXISTS esign_storage_write ON storage.objects;
DROP POLICY IF EXISTS esign_storage_update ON storage.objects;
DROP POLICY IF EXISTS esign_storage_delete ON storage.objects;

CREATE POLICY esign_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = ANY (ARRAY['esign-source','esign-signed','esign-signatures'])
    AND public.can_view_esign_id_doc(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY esign_storage_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = ANY (ARRAY['esign-source','esign-signed','esign-signatures'])
    AND public.can_view_esign_id_doc(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY esign_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = ANY (ARRAY['esign-source','esign-signed','esign-signatures'])
    AND public.can_view_esign_id_doc(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY esign_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = ANY (ARRAY['esign-source','esign-signed','esign-signatures'])
    AND public.can_view_esign_id_doc(((storage.foldername(name))[1])::uuid)
  );

-- Fix 2: Restrict profiles_hierarchy_history reads to internal users
DROP POLICY IF EXISTS "hierarchy history read" ON public.profiles_hierarchy_history;
CREATE POLICY "hierarchy history read" ON public.profiles_hierarchy_history
  FOR SELECT TO authenticated
  USING (public.is_internal_user_id(auth.uid()));

-- Fix 3: Scope project_file_tags by firm via projects.user_can_access_firm
DROP POLICY IF EXISTS "Authenticated users can view project file tags" ON public.project_file_tags;
DROP POLICY IF EXISTS "Authenticated users can create project file tags" ON public.project_file_tags;
DROP POLICY IF EXISTS "Authenticated users can update project file tags" ON public.project_file_tags;
DROP POLICY IF EXISTS "Authenticated users can delete project file tags" ON public.project_file_tags;

CREATE POLICY "project file tags select firm-scoped" ON public.project_file_tags
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_file_tags.project_id
      AND public.user_can_access_firm(p.firm_id)
  ));

CREATE POLICY "project file tags insert internal firm-scoped" ON public.project_file_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_internal_user_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_file_tags.project_id
        AND public.user_can_access_firm(p.firm_id)
    )
  );

CREATE POLICY "project file tags update internal firm-scoped" ON public.project_file_tags
  FOR UPDATE TO authenticated
  USING (
    public.is_internal_user_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_file_tags.project_id
        AND public.user_can_access_firm(p.firm_id)
    )
  );

CREATE POLICY "project file tags delete internal firm-scoped" ON public.project_file_tags
  FOR DELETE TO authenticated
  USING (
    public.is_internal_user_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_file_tags.project_id
        AND public.user_can_access_firm(p.firm_id)
    )
  );