-- 1. Extend block_type enum with new types
ALTER TYPE public.organizer_block_type ADD VALUE IF NOT EXISTS 'divider';
ALTER TYPE public.organizer_block_type ADD VALUE IF NOT EXISTS 'attachment_request';
ALTER TYPE public.organizer_block_type ADD VALUE IF NOT EXISTS 'rating';
ALTER TYPE public.organizer_block_type ADD VALUE IF NOT EXISTS 'matrix';

-- 2. Template version snapshots (for rollback + diff)
CREATE TABLE IF NOT EXISTS public.organizer_template_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.organizer_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json JSONB NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_organizer_template_versions_tpl
  ON public.organizer_template_versions(template_id, version DESC);

ALTER TABLE public.organizer_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizer managers can view template versions"
  ON public.organizer_template_versions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance_manager'::app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::app_role)
  );

CREATE POLICY "Organizer managers can create template versions"
  ON public.organizer_template_versions FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'finance_manager'::app_role)
      OR public.has_role(auth.uid(), 'hr_manager'::app_role)
    )
  );