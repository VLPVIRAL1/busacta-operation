
-- Annotations on a task attachment (PDF page or image)
CREATE TABLE public.task_file_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.task_attachments(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  page integer NOT NULL DEFAULT 1,
  kind text NOT NULL CHECK (kind IN ('pin','rect')),
  geometry jsonb NOT NULL,
  color text NOT NULL DEFAULT '#fbbf24',
  body text NOT NULL DEFAULT '',
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_client_visible boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tfa_file ON public.task_file_annotations(file_id, page);
CREATE INDEX idx_tfa_task ON public.task_file_annotations(task_id);

ALTER TABLE public.task_file_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage annotations"
  ON public.task_file_annotations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Clients read shared annotations"
  ON public.task_file_annotations
  FOR SELECT
  TO authenticated
  USING (
    is_client_visible = true
    AND EXISTS (
      SELECT 1 FROM public.task_attachments a
      JOIN public.tasks t ON t.id = a.task_id
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = ce.project_id
      WHERE a.id = task_file_annotations.file_id
        AND a.is_client_visible = true
        AND public.user_can_access_firm(p.firm_id)
    )
  );

CREATE TRIGGER trg_tfa_updated_at
  BEFORE UPDATE ON public.task_file_annotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Threaded replies
CREATE TABLE public.task_file_annotation_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id uuid NOT NULL REFERENCES public.task_file_annotations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tfar_ann ON public.task_file_annotation_replies(annotation_id, created_at);

ALTER TABLE public.task_file_annotation_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage annotation replies"
  ON public.task_file_annotation_replies
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Clients read shared annotation replies"
  ON public.task_file_annotation_replies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_file_annotations ann
      JOIN public.task_attachments a ON a.id = ann.file_id
      JOIN public.tasks t ON t.id = a.task_id
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = ce.project_id
      WHERE ann.id = task_file_annotation_replies.annotation_id
        AND ann.is_client_visible = true
        AND a.is_client_visible = true
        AND public.user_can_access_firm(p.firm_id)
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_file_annotations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_file_annotation_replies;
ALTER TABLE public.task_file_annotations REPLICA IDENTITY FULL;
ALTER TABLE public.task_file_annotation_replies REPLICA IDENTITY FULL;
