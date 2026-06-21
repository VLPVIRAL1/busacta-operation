-- Learning Knowledge Engine: training_notes, learning_news_posts,
-- learning_questions, learning_answers, training_paths,
-- training_path_items, training_path_assignments

-- ── training_notes ────────────────────────────────────────────────────────────
CREATE TABLE public.training_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.training_courses(id) ON DELETE SET NULL,
  sharepoint_item_id TEXT,
  content JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.training_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_notes_own"
  ON public.training_notes FOR ALL
  USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());

CREATE UNIQUE INDEX training_notes_employee_course_uidx
  ON public.training_notes(employee_id, course_id)
  WHERE course_id IS NOT NULL;

CREATE UNIQUE INDEX training_notes_employee_spitem_uidx
  ON public.training_notes(employee_id, sharepoint_item_id)
  WHERE sharepoint_item_id IS NOT NULL AND course_id IS NULL;

CREATE INDEX training_notes_employee_idx ON public.training_notes(employee_id);

CREATE TRIGGER update_training_notes_updated_at
  BEFORE UPDATE ON public.training_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── learning_news_posts ───────────────────────────────────────────────────────
CREATE TABLE public.learning_news_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  author_id UUID NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_news_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_news_read"
  ON public.learning_news_posts FOR SELECT
  USING (firm_id = public.current_user_firm_id());

CREATE POLICY "learning_news_manage"
  ON public.learning_news_posts FOR ALL
  USING (
    firm_id = public.current_user_firm_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr_manager')
    )
  )
  WITH CHECK (
    firm_id = public.current_user_firm_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr_manager')
    )
  );

CREATE INDEX learning_news_firm_idx ON public.learning_news_posts(firm_id, pinned DESC, published_at DESC);

CREATE TRIGGER update_learning_news_posts_updated_at
  BEFORE UPDATE ON public.learning_news_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── learning_questions ────────────────────────────────────────────────────────
CREATE TABLE public.learning_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.training_courses(id) ON DELETE SET NULL,
  asker_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_questions_read"
  ON public.learning_questions FOR SELECT
  USING (firm_id = public.current_user_firm_id());

CREATE POLICY "learning_questions_insert"
  ON public.learning_questions FOR INSERT
  WITH CHECK (
    asker_id = auth.uid()
    AND firm_id = public.current_user_firm_id()
  );

CREATE POLICY "learning_questions_update"
  ON public.learning_questions FOR UPDATE
  USING (
    asker_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "learning_questions_delete"
  ON public.learning_questions FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE INDEX learning_questions_firm_idx ON public.learning_questions(firm_id, course_id, is_resolved);

CREATE TRIGGER update_learning_questions_updated_at
  BEFORE UPDATE ON public.learning_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── learning_answers ──────────────────────────────────────────────────────────
CREATE TABLE public.learning_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.learning_questions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_answers_read"
  ON public.learning_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_questions q
      WHERE q.id = question_id
        AND q.firm_id = public.current_user_firm_id()
    )
  );

CREATE POLICY "learning_answers_insert"
  ON public.learning_answers FOR INSERT
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "learning_answers_update"
  ON public.learning_answers FOR UPDATE
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "learning_answers_delete"
  ON public.learning_answers FOR DELETE
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE INDEX learning_answers_question_idx ON public.learning_answers(question_id);

CREATE TRIGGER update_learning_answers_updated_at
  BEFORE UPDATE ON public.learning_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── training_paths ────────────────────────────────────────────────────────────
CREATE TABLE public.training_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.training_paths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_paths_read"
  ON public.training_paths FOR SELECT
  USING (firm_id = public.current_user_firm_id());

CREATE POLICY "training_paths_manage"
  ON public.training_paths FOR ALL
  USING (
    firm_id = public.current_user_firm_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr_manager')
    )
  )
  WITH CHECK (
    firm_id = public.current_user_firm_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr_manager')
    )
  );

CREATE INDEX training_paths_firm_idx ON public.training_paths(firm_id);

CREATE TRIGGER update_training_paths_updated_at
  BEFORE UPDATE ON public.training_paths
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── training_path_items ───────────────────────────────────────────────────────
CREATE TABLE public.training_path_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES public.training_paths(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (path_id, course_id)
);

ALTER TABLE public.training_path_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_path_items_read"
  ON public.training_path_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.training_paths p
      WHERE p.id = path_id AND p.firm_id = public.current_user_firm_id()
    )
  );

CREATE POLICY "training_path_items_manage"
  ON public.training_path_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.training_paths p
      WHERE p.id = path_id AND p.firm_id = public.current_user_firm_id()
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'super_admin')
          OR public.has_role(auth.uid(), 'hr_manager')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.training_paths p
      WHERE p.id = path_id AND p.firm_id = public.current_user_firm_id()
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'super_admin')
          OR public.has_role(auth.uid(), 'hr_manager')
        )
    )
  );

CREATE INDEX training_path_items_path_idx ON public.training_path_items(path_id, position);


-- ── training_path_assignments ─────────────────────────────────────────────────
CREATE TABLE public.training_path_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES public.training_paths(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  assigned_by UUID NOT NULL,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (path_id, employee_id)
);

ALTER TABLE public.training_path_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_path_assignments_read"
  ON public.training_path_assignments FOR SELECT
  USING (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "training_path_assignments_manage"
  ON public.training_path_assignments FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE INDEX training_path_assignments_employee_idx ON public.training_path_assignments(employee_id);
CREATE INDEX training_path_assignments_path_idx ON public.training_path_assignments(path_id);
