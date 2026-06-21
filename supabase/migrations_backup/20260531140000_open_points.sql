-- Open Points: client-facing questions/requests raised by the firm, with a
-- client reply thread. Surfaces in the portal "Open points" section and an
-- internal authoring tab. Firm- or project-scoped, mirroring `sops`.

CREATE TABLE IF NOT EXISTS public.open_points (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'resolved')),
  created_by  uuid REFERENCES auth.users(id),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT open_points_scope_chk CHECK (firm_id IS NOT NULL OR project_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_open_points_firm ON public.open_points(firm_id);
CREATE INDEX IF NOT EXISTS idx_open_points_project ON public.open_points(project_id);

CREATE TABLE IF NOT EXISTS public.open_point_replies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_point_id uuid NOT NULL REFERENCES public.open_points(id) ON DELETE CASCADE,
  author_id     uuid REFERENCES auth.users(id),
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_open_point_replies_point ON public.open_point_replies(open_point_id);

ALTER TABLE public.open_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_point_replies ENABLE ROW LEVEL SECURITY;

-- Shared helper: can the caller see this open point's firm/project?
-- (Inlined into policies below rather than a separate function for clarity.)

-- ── open_points policies ──────────────────────────────────────────────────────
CREATE POLICY "Internal manage open points"
  ON public.open_points
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

CREATE POLICY "Clients read accessible open points"
  ON public.open_points
  FOR SELECT
  TO authenticated
  USING (
    (firm_id IS NOT NULL AND public.user_can_access_firm(firm_id))
    OR (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = open_points.project_id AND public.user_can_access_firm(p.firm_id)
    ))
  );

-- ── open_point_replies policies ──────────────────────────────────────────────
CREATE POLICY "Internal manage open point replies"
  ON public.open_point_replies
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

CREATE POLICY "Participants read open point replies"
  ON public.open_point_replies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.open_points op
      WHERE op.id = open_point_replies.open_point_id
        AND (
          (op.firm_id IS NOT NULL AND public.user_can_access_firm(op.firm_id))
          OR (op.project_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = op.project_id AND public.user_can_access_firm(p.firm_id)
          ))
        )
    )
  );

CREATE POLICY "Participants add open point replies"
  ON public.open_point_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.open_points op
      WHERE op.id = open_point_replies.open_point_id
        AND (
          (op.firm_id IS NOT NULL AND public.user_can_access_firm(op.firm_id))
          OR (op.project_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = op.project_id AND public.user_can_access_firm(p.firm_id)
          ))
        )
    )
  );

-- A client reply flips an open point from 'open' to 'answered'. Staff resolve
-- explicitly (status='resolved') via the internal UI.
CREATE OR REPLACE FUNCTION public.tg_open_point_reply_answered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(NEW.author_id, 'admin') OR public.has_role(NEW.author_id, 'employee')) THEN
    UPDATE public.open_points
       SET status = 'answered', updated_at = now()
     WHERE id = NEW.open_point_id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_open_point_reply_answered ON public.open_point_replies;
CREATE TRIGGER trg_open_point_reply_answered
  AFTER INSERT ON public.open_point_replies
  FOR EACH ROW EXECUTE FUNCTION public.tg_open_point_reply_answered();
