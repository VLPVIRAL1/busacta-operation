-- Phase 2 marketing hub: per-campaign task checklists + content/asset library.
-- Calendar is derived from existing campaign dates + task due dates (no table).
-- Access: admins only, mirroring marketing_campaigns.

-- Per-campaign task checklist -------------------------------------------------
CREATE TABLE public.campaign_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  due_date DATE,
  assignee_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tasks view admin" ON public.campaign_tasks FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Tasks insert admin" ON public.campaign_tasks FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Tasks update admin" ON public.campaign_tasks FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Tasks delete admin" ON public.campaign_tasks FOR DELETE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX campaign_tasks_campaign_idx ON public.campaign_tasks(campaign_id, due_date);

-- Content / asset library -----------------------------------------------------
CREATE TYPE public.marketing_asset_type AS ENUM (
  'case_study', 'collateral', 'blog_post', 'template', 'image', 'video', 'link', 'other'
);

CREATE TABLE public.marketing_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  asset_type public.marketing_asset_type NOT NULL DEFAULT 'other',
  url TEXT,
  description TEXT,
  campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assets view admin" ON public.marketing_assets FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Assets insert admin" ON public.marketing_assets FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Assets update admin" ON public.marketing_assets FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Assets delete admin" ON public.marketing_assets FOR DELETE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER marketing_assets_updated_at
  BEFORE UPDATE ON public.marketing_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX marketing_assets_type_idx ON public.marketing_assets(asset_type);
CREATE INDEX marketing_assets_campaign_idx ON public.marketing_assets(campaign_id);
