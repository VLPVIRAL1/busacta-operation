-- Marketing campaigns: first-class campaign records + lead attribution.
-- Mirrors the leads feature (20260509002153_*.sql). Access: admins only.

CREATE TYPE public.campaign_channel AS ENUM ('email', 'social', 'events', 'content', 'referral', 'paid', 'seo', 'other');
CREATE TYPE public.campaign_status AS ENUM ('planned', 'in_progress', 'live', 'done', 'cancelled');

CREATE TABLE public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel public.campaign_channel NOT NULL DEFAULT 'other',
  status public.campaign_status NOT NULL DEFAULT 'planned',
  goal TEXT,
  description TEXT,
  owner_id UUID,
  start_date DATE,
  end_date DATE,
  budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  target_metric TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View admin"
  ON public.marketing_campaigns FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Insert admin"
  ON public.marketing_campaigns FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Update admin"
  ON public.marketing_campaigns FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Delete admin"
  ON public.marketing_campaigns FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE TRIGGER marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX marketing_campaigns_status_idx ON public.marketing_campaigns(status);

-- Attribution: link a lead to the campaign that produced it.
ALTER TABLE public.leads
  ADD COLUMN campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;

CREATE INDEX leads_campaign_idx ON public.leads(campaign_id);
