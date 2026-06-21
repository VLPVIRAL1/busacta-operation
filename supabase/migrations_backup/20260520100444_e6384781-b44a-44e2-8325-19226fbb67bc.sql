
-- Storage & Routing Target columns on esign_envelopes
DO $$ BEGIN
  CREATE TYPE esign_target_kind AS ENUM ('direct_client', 'cpa', 'hr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.esign_envelopes
  ADD COLUMN IF NOT EXISTS target_kind esign_target_kind,
  ADD COLUMN IF NOT EXISTS target_direct_client_id uuid REFERENCES public.direct_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_organizer_deployment_id uuid REFERENCES public.organizer_deployments(id) ON DELETE SET NULL;

-- Validation trigger (XOR by kind; allow NULL kind for in-flight drafts)
CREATE OR REPLACE FUNCTION public.validate_esign_target_xor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.target_kind IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.target_kind = 'direct_client' THEN
    IF NEW.target_direct_client_id IS NULL THEN
      RAISE EXCEPTION 'target_direct_client_id required when target_kind=direct_client';
    END IF;
    IF NEW.target_profile_id IS NOT NULL OR NEW.target_task_id IS NOT NULL THEN
      RAISE EXCEPTION 'direct_client target must not set profile or task';
    END IF;
  ELSIF NEW.target_kind = 'cpa' THEN
    IF NEW.project_id IS NULL THEN
      RAISE EXCEPTION 'project_id required when target_kind=cpa';
    END IF;
    IF NEW.target_direct_client_id IS NOT NULL OR NEW.target_profile_id IS NOT NULL THEN
      RAISE EXCEPTION 'cpa target must not set direct_client or profile';
    END IF;
  ELSIF NEW.target_kind = 'hr' THEN
    IF NEW.target_profile_id IS NULL THEN
      RAISE EXCEPTION 'target_profile_id required when target_kind=hr';
    END IF;
    IF NEW.target_direct_client_id IS NOT NULL OR NEW.target_task_id IS NOT NULL THEN
      RAISE EXCEPTION 'hr target must not set direct_client or task';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS esign_envelopes_target_xor ON public.esign_envelopes;
CREATE TRIGGER esign_envelopes_target_xor
  BEFORE INSERT OR UPDATE ON public.esign_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.validate_esign_target_xor();

-- Per-page-per-recipient layout overlay for Auto-Arrange engine
CREATE TABLE IF NOT EXISTS public.esign_page_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL REFERENCES public.esign_envelopes(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.esign_documents(id) ON DELETE CASCADE,
  page_index integer NOT NULL,
  recipient_id uuid NOT NULL REFERENCES public.esign_recipients(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','auto')),
  orientation text CHECK (orientation IN ('horizontal','vertical')),
  sequence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  origin_x_pt numeric,
  origin_y_pt numeric,
  spacing_pt numeric NOT NULL DEFAULT 8,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (envelope_id, document_id, page_index, recipient_id)
);

CREATE INDEX IF NOT EXISTS esign_page_layouts_env_idx
  ON public.esign_page_layouts (envelope_id, document_id, page_index);

ALTER TABLE public.esign_page_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esign_page_layouts_rw ON public.esign_page_layouts;
CREATE POLICY esign_page_layouts_rw ON public.esign_page_layouts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.esign_envelopes e
                 WHERE e.id = esign_page_layouts.envelope_id
                   AND public.can_manage_esign(e.firm_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.esign_envelopes e
                 WHERE e.id = esign_page_layouts.envelope_id
                   AND public.can_manage_esign(e.firm_id)));
