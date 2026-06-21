
CREATE TYPE public.lead_source AS ENUM ('referral', 'website', 'cold_outreach', 'event', 'partner', 'other');
CREATE TYPE public.lead_stage AS ENUM ('new', 'qualified', 'proposal', 'negotiation', 'won', 'lost');
CREATE TYPE public.lead_activity_type AS ENUM ('note', 'call', 'email', 'meeting', 'proposal', 'other');

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  source public.lead_source NOT NULL DEFAULT 'other',
  stage public.lead_stage NOT NULL DEFAULT 'new',
  estimated_value NUMERIC(14,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  expected_close_date DATE,
  owner_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or manager"
  ON public.leads FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE POLICY "Insert own or manager"
  ON public.leads FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE POLICY "Update own or manager"
  ON public.leads FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE POLICY "Delete manager"
  ON public.leads FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX leads_stage_idx ON public.leads(stage);
CREATE INDEX leads_owner_idx ON public.leads(owner_id);

CREATE TABLE public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type public.lead_activity_type NOT NULL DEFAULT 'note',
  summary TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View if lead visible"
  ON public.lead_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND (
          l.owner_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'super_admin')
          OR public.has_role(auth.uid(), 'finance_manager')
        )
    )
  );

CREATE POLICY "Insert if lead visible"
  ON public.lead_activities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND (
          l.owner_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'super_admin')
          OR public.has_role(auth.uid(), 'finance_manager')
        )
    )
  );

CREATE POLICY "Delete own or manager"
  ON public.lead_activities FOR DELETE
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE INDEX lead_activities_lead_idx ON public.lead_activities(lead_id, occurred_at DESC);
