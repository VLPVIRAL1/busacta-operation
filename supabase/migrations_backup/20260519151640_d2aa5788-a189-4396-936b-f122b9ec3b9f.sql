-- 1. organizer_public_links table
CREATE TABLE public.organizer_public_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.organizer_templates(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by UUID NOT NULL,
  firm_id UUID REFERENCES public.firms(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  max_submissions INTEGER,
  require_identity BOOLEAN NOT NULL DEFAULT true,
  password_hash TEXT,
  revoked_at TIMESTAMPTZ,
  submission_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizer_public_links_template ON public.organizer_public_links(template_id);
CREATE INDEX idx_organizer_public_links_token ON public.organizer_public_links(token);

ALTER TABLE public.organizer_public_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public links: managers can view"
  ON public.organizer_public_links FOR SELECT
  USING (public.can_manage_organizer(auth.uid()));

CREATE POLICY "Public links: managers can insert"
  ON public.organizer_public_links FOR INSERT
  WITH CHECK (public.can_manage_organizer(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Public links: managers can update"
  ON public.organizer_public_links FOR UPDATE
  USING (public.can_manage_organizer(auth.uid()));

CREATE POLICY "Public links: admins can delete"
  ON public.organizer_public_links FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_organizer_public_links_updated_at
  BEFORE UPDATE ON public.organizer_public_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Extend organizer_deployments
ALTER TABLE public.organizer_deployments
  ADD COLUMN public_link_id UUID REFERENCES public.organizer_public_links(id) ON DELETE SET NULL,
  ADD COLUMN external_name TEXT,
  ADD COLUMN external_email TEXT,
  ADD COLUMN external_company TEXT;

ALTER TABLE public.organizer_deployments
  ALTER COLUMN assignee_profile_id DROP NOT NULL,
  ALTER COLUMN assigned_by DROP NOT NULL;

ALTER TABLE public.organizer_deployments
  ADD CONSTRAINT organizer_deployments_assignee_or_public_link
  CHECK (
    (public_link_id IS NULL AND assignee_profile_id IS NOT NULL)
    OR
    (public_link_id IS NOT NULL)
  );

CREATE INDEX idx_organizer_deployments_public_link ON public.organizer_deployments(public_link_id);

-- 3. Allow managers to view deployments that came from a public link they can manage
DROP POLICY IF EXISTS "Deployments: viewable by allowed users" ON public.organizer_deployments;
CREATE POLICY "Deployments: viewable by allowed users"
  ON public.organizer_deployments FOR SELECT
  USING (
    (assignee_profile_id = auth.uid())
    OR (assigned_by = auth.uid())
    OR public.can_manage_organizer(auth.uid())
  );