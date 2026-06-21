-- PDF Template Design Engine
-- Tables: pdf_templates, pdf_template_fields
-- Enums:  pdf_doc_type, pdf_template_status, pdf_field_type

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE pdf_doc_type AS ENUM (
  'invoice',
  'proforma',
  'salary_slip',
  'financial_report',
  'bank_recon',
  'petty_cash_recon'
);

CREATE TYPE pdf_template_status AS ENUM ('draft', 'published', 'archived');

CREATE TYPE pdf_field_type AS ENUM (
  'section',
  'logo',
  'static_text',
  'placeholder',
  'divider',
  'spacer',
  'line_items_table',
  'totals_block',
  'earnings_deductions_table',
  'report_table',
  'signature_block',
  'payment_details',
  'notes_block'
);

-- ─── pdf_templates ───────────────────────────────────────────────────────────

CREATE TABLE pdf_templates (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT        NOT NULL,
  description        TEXT,
  doc_type           pdf_doc_type NOT NULL,
  status             pdf_template_status NOT NULL DEFAULT 'draft',
  version            INTEGER     NOT NULL DEFAULT 1,
  parent_template_id UUID        REFERENCES pdf_templates(id) ON DELETE SET NULL,
  firm_id            UUID        REFERENCES firms(id) ON DELETE CASCADE,
  is_global          BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Branding
  primary_color      TEXT        NOT NULL DEFAULT '#1e3a8a',
  secondary_color    TEXT        NOT NULL DEFAULT '#c9a84c',
  font_family        TEXT        NOT NULL DEFAULT 'Helvetica',
  logo_storage_path  TEXT,
  -- Page layout
  page_size          TEXT        NOT NULL DEFAULT 'A4',
  orientation        TEXT        NOT NULL DEFAULT 'portrait',
  margin_top         NUMERIC     NOT NULL DEFAULT 40,
  margin_right       NUMERIC     NOT NULL DEFAULT 40,
  margin_bottom      NUMERIC     NOT NULL DEFAULT 40,
  margin_left        NUMERIC     NOT NULL DEFAULT 40,
  -- Audit
  created_by         UUID        NOT NULL REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdf_templates_firm ON pdf_templates(firm_id);
CREATE INDEX idx_pdf_templates_doc_type ON pdf_templates(doc_type);
CREATE INDEX idx_pdf_templates_status ON pdf_templates(status);

-- ─── pdf_template_fields ─────────────────────────────────────────────────────

CREATE TABLE pdf_template_fields (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID         NOT NULL REFERENCES pdf_templates(id) ON DELETE CASCADE,
  parent_id   UUID         REFERENCES pdf_template_fields(id) ON DELETE CASCADE,
  order_index INTEGER      NOT NULL DEFAULT 0,
  field_type  pdf_field_type NOT NULL,
  label       TEXT,
  config_json JSONB        NOT NULL DEFAULT '{}',
  is_visible  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdf_template_fields_template ON pdf_template_fields(template_id);
CREATE INDEX idx_pdf_template_fields_parent ON pdf_template_fields(parent_id);

-- ─── updated_at triggers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdf_templates_updated_at
  BEFORE UPDATE ON pdf_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pdf_template_fields_updated_at
  BEFORE UPDATE ON pdf_template_fields
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE pdf_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_template_fields ENABLE ROW LEVEL SECURITY;

-- Admins can fully manage templates (global or their firm)
CREATE POLICY "admins_manage_pdf_templates"
  ON pdf_templates FOR ALL
  USING (
    current_user_role() IN ('super_admin', 'admin')
    AND (is_global = TRUE OR firm_id IS NULL OR user_can_access_firm(firm_id))
  )
  WITH CHECK (
    current_user_role() IN ('super_admin', 'admin')
  );

-- All firm members can read published templates for their firm (or global)
CREATE POLICY "members_read_published_pdf_templates"
  ON pdf_templates FOR SELECT
  USING (
    status = 'published'
    AND (is_global = TRUE OR firm_id IS NULL OR user_can_access_firm(firm_id))
  );

-- Fields inherit access from their parent template
CREATE POLICY "pdf_template_fields_follow_template"
  ON pdf_template_fields FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM pdf_templates t
      WHERE t.id = template_id
        AND (
          current_user_role() IN ('super_admin', 'admin')
          OR (t.status = 'published' AND (t.is_global = TRUE OR t.firm_id IS NULL OR user_can_access_firm(t.firm_id)))
        )
    )
  );
