-- =============================================================
-- 1) Avatars storage bucket (public read, user-scoped writes)
-- =============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;
CREATE POLICY "Avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

-- =============================================================
-- 2) Per-task permission matrix
-- =============================================================
CREATE TABLE IF NOT EXISTS public.task_permissions (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit_fields boolean NOT NULL DEFAULT false,
  can_edit_time boolean NOT NULL DEFAULT false,
  can_manage_subtasks boolean NOT NULL DEFAULT false,
  can_manage_attachments boolean NOT NULL DEFAULT false,
  can_change_status boolean NOT NULL DEFAULT false,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE public.task_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal manage task_permissions" ON public.task_permissions;
CREATE POLICY "Internal manage task_permissions" ON public.task_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'));

DROP POLICY IF EXISTS "Users read own task_permissions" ON public.task_permissions;
CREATE POLICY "Users read own task_permissions" ON public.task_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE TRIGGER trg_task_permissions_updated
BEFORE UPDATE ON public.task_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Capability helper. Internal users (admin/employee) always pass.
CREATE OR REPLACE FUNCTION public.task_capability(_task_id uuid, _capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee') THEN
    RETURN true;
  END IF;
  EXECUTE format(
    'SELECT COALESCE((SELECT %I FROM public.task_permissions WHERE task_id = $1 AND user_id = $2), false)',
    _capability
  ) INTO ok USING _task_id, auth.uid();
  RETURN COALESCE(ok, false);
END $$;

-- =============================================================
-- 3) Message read tracking for inbox unread counts
-- =============================================================
DO $$ BEGIN
  CREATE TYPE public.message_scope AS ENUM ('firm', 'task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.message_reads (
  user_id uuid NOT NULL,
  scope public.message_scope NOT NULL,
  scope_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, scope_id)
);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reads" ON public.message_reads;
CREATE POLICY "Users manage own reads" ON public.message_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_message_reads_lookup ON public.message_reads (user_id, scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_task_created ON public.task_messages (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_firm_messages_firm_created ON public.firm_messages (firm_id, created_at);