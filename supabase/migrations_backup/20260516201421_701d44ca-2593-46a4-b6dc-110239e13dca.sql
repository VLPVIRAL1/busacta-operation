
CREATE TABLE public.task_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('private','public')) DEFAULT 'private',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_views_owner_idx ON public.task_views(owner_id);
CREATE INDEX task_views_scope_idx ON public.task_views(scope);

ALTER TABLE public.task_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_views_select_own_or_public"
  ON public.task_views FOR SELECT
  USING (owner_id = auth.uid() OR scope = 'public');

CREATE POLICY "task_views_insert_own"
  ON public.task_views FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "task_views_update_own_or_admin"
  ON public.task_views FOR UPDATE
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "task_views_delete_own_or_admin"
  ON public.task_views FOR DELETE
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER task_views_set_updated_at
  BEFORE UPDATE ON public.task_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
