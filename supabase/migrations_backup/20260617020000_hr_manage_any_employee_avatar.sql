-- Allow HR Manager / people.manage capability / Super Admin / Admin to change the
-- profile photo (avatar) of ANY employee.
--
-- Before this change:
--   * avatars storage bucket INSERT/UPDATE/DELETE only allowed the owner OR 'admin'.
--     => super_admin and hr_manager could NOT upload/replace another user's photo.
--   * profiles UPDATE ("Admins update profiles") allowed admin/super_admin/hr_manager
--     but not a non-role holder of the people.manage capability.
--
-- "HR Permission" is modelled by the people.manage capability (role_capabilities),
-- so has_capability(auth.uid(),'people.manage') is included for future grants.
--
-- The owner-only path (self uploads) and the read policy ("Avatar read scoped")
-- are unchanged. Plain employees remain blocked from editing other users' photos.

-- Shared predicate: who may manage another person's avatar/profile.
--   self check is added per-statement for storage (path = `<userId>/...`).

-- 1) avatars storage bucket -----------------------------------------------------
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'hr_manager'::app_role)
      OR has_capability(auth.uid(), 'people.manage')
    )
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'hr_manager'::app_role)
      OR has_capability(auth.uid(), 'people.manage')
    )
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'hr_manager'::app_role)
      OR has_capability(auth.uid(), 'people.manage')
    )
  );

-- 2) profiles row write (avatar_url etc.) --------------------------------------
DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;
CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
    OR has_capability(auth.uid(), 'people.manage')
  );
