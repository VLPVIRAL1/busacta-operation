-- Per-block score breakdown (one row per graded block per deployment)
CREATE TABLE public.organizer_block_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES public.organizer_deployments(id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES public.organizer_blocks(id) ON DELETE CASCADE,
  earned NUMERIC NOT NULL DEFAULT 0,
  possible NUMERIC NOT NULL DEFAULT 0,
  is_correct BOOLEAN,
  reviewer_note TEXT,
  graded_by UUID NOT NULL,
  graded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, block_id)
);

CREATE INDEX idx_organizer_block_scores_deployment ON public.organizer_block_scores(deployment_id);

ALTER TABLE public.organizer_block_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "BlockScores: view if can view deployment"
  ON public.organizer_block_scores FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organizer_deployments d
      WHERE d.id = organizer_block_scores.deployment_id
        AND (d.assignee_profile_id = auth.uid() OR public.can_manage_organizer(auth.uid()))
    )
  );

CREATE POLICY "BlockScores: managers can write"
  ON public.organizer_block_scores FOR ALL TO authenticated
  USING (public.can_manage_organizer(auth.uid()))
  WITH CHECK (public.can_manage_organizer(auth.uid()));

CREATE TRIGGER trg_organizer_block_scores_updated
  BEFORE UPDATE ON public.organizer_block_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Review audit log (append-only history of reviewer actions)
CREATE TYPE public.organizer_review_action AS ENUM (
  'graded', 'returned', 'reopened', 'note_updated', 'score_overridden'
);

CREATE TABLE public.organizer_review_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES public.organizer_deployments(id) ON DELETE CASCADE,
  action public.organizer_review_action NOT NULL,
  actor_id UUID NOT NULL,
  notes TEXT,
  snapshot_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizer_review_audit_deployment
  ON public.organizer_review_audit_log(deployment_id, created_at DESC);

ALTER TABLE public.organizer_review_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ReviewAudit: view if can view deployment"
  ON public.organizer_review_audit_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organizer_deployments d
      WHERE d.id = organizer_review_audit_log.deployment_id
        AND (d.assignee_profile_id = auth.uid() OR public.can_manage_organizer(auth.uid()))
    )
  );

CREATE POLICY "ReviewAudit: managers can insert"
  ON public.organizer_review_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_organizer(auth.uid()));

CREATE POLICY "ReviewAudit: super_admin can delete"
  ON public.organizer_review_audit_log FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
