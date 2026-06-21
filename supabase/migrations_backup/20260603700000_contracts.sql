-- Contracts (NDA / SLA) preparation tooling for the Growth hub.
-- Counterparty "profiles" (legal parties), reusable mail-merge templates, and an
-- immutable audit trail of generated documents. Access: admins only.
-- Mirrors marketing_campaigns (20260603400000_*.sql) for RLS + trigger conventions.

CREATE TYPE public.contract_type            AS ENUM ('nda', 'sla', 'other');
CREATE TYPE public.contract_template_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.contract_doc_format      AS ENUM ('docx', 'pdf');

-- ── Contract profiles: the legal counterparty merged into documents ──────────
CREATE TABLE public.contract_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registered_legal_name TEXT NOT NULL,
  trading_name TEXT,
  address TEXT,
  signatory_name TEXT,
  signatory_title TEXT,
  jurisdiction TEXT,
  effective_date DATE,
  email TEXT,
  phone TEXT,
  contract_type public.contract_type NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'active',
  owner_id UUID,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View admin" ON public.contract_profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Insert admin" ON public.contract_profiles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Update admin" ON public.contract_profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Delete admin" ON public.contract_profiles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER contract_profiles_updated_at
  BEFORE UPDATE ON public.contract_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX contract_profiles_type_idx     ON public.contract_profiles(contract_type);
CREATE INDEX contract_profiles_status_idx   ON public.contract_profiles(status);
CREATE INDEX contract_profiles_owner_idx    ON public.contract_profiles(owner_id);
CREATE INDEX contract_profiles_lead_idx     ON public.contract_profiles(lead_id);
CREATE INDEX contract_profiles_campaign_idx ON public.contract_profiles(campaign_id);

-- ── Contract templates: rich-text body with {{merge_field}} tokens ───────────
CREATE TABLE public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  contract_type public.contract_type NOT NULL DEFAULT 'nda',
  status public.contract_template_status NOT NULL DEFAULT 'draft',
  body_html TEXT NOT NULL DEFAULT '',
  body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  parent_template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  jurisdiction TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View admin" ON public.contract_templates FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Insert admin" ON public.contract_templates FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Update admin" ON public.contract_templates FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Delete admin" ON public.contract_templates FOR DELETE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX contract_templates_type_idx   ON public.contract_templates(contract_type);
CREATE INDEX contract_templates_status_idx ON public.contract_templates(status);

-- ── Contract documents: immutable audit trail (no file stored) ───────────────
CREATE TABLE public.contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  profile_id UUID REFERENCES public.contract_profiles(id) ON DELETE SET NULL,
  profile_name TEXT NOT NULL,
  contract_type public.contract_type NOT NULL,
  output_format public.contract_doc_format NOT NULL,
  file_name TEXT NOT NULL,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;

-- SELECT + INSERT only — the audit trail is append-only / immutable.
CREATE POLICY "View admin" ON public.contract_documents FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Insert admin" ON public.contract_documents FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX contract_documents_generated_idx ON public.contract_documents(generated_at DESC);
CREATE INDEX contract_documents_profile_idx   ON public.contract_documents(profile_id);
CREATE INDEX contract_documents_template_idx  ON public.contract_documents(template_id);
CREATE INDEX contract_documents_by_idx        ON public.contract_documents(generated_by);
