
-- 1. Add columns to direct_clients to match firms feature set
ALTER TABLE public.direct_clients
  ADD COLUMN IF NOT EXISTS client_code text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS us_timezone text DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS esign_sender_name text,
  ADD COLUMN IF NOT EXISTS esign_reply_to text,
  ADD COLUMN IF NOT EXISTS accounting_software text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tax_software text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pm_software text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid,
  ADD COLUMN IF NOT EXISTS deactivation_reason text,
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS billing_email text;

-- 2. client_code: auto-generate (first 3 letters of display_name + 3-digit seq), unique CI
CREATE OR REPLACE FUNCTION public.generate_direct_client_code(_display_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  seq int;
  candidate text;
BEGIN
  prefix := upper(regexp_replace(COALESCE(_display_name, 'CLI'), '[^A-Za-z]', '', 'g'));
  prefix := lpad(left(prefix, 3), 3, 'X');
  FOR seq IN 1..999 LOOP
    candidate := prefix || lpad(seq::text, 3, '0');
    IF NOT EXISTS (SELECT 1 FROM public.direct_clients WHERE upper(client_code) = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  -- fallback: random
  RETURN prefix || substr(md5(random()::text), 1, 3);
END;
$$;

CREATE OR REPLACE FUNCTION public.direct_clients_assign_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.client_code IS NULL OR length(trim(NEW.client_code)) = 0 THEN
    NEW.client_code := public.generate_direct_client_code(NEW.display_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_direct_clients_assign_code ON public.direct_clients;
CREATE TRIGGER trg_direct_clients_assign_code
  BEFORE INSERT ON public.direct_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.direct_clients_assign_code();

-- backfill any existing rows
UPDATE public.direct_clients
SET client_code = public.generate_direct_client_code(display_name)
WHERE client_code IS NULL;

ALTER TABLE public.direct_clients ALTER COLUMN client_code SET NOT NULL;
ALTER TABLE public.direct_clients
  ADD CONSTRAINT direct_clients_code_format_chk
  CHECK (client_code ~ '^[A-Z0-9]{2,10}$');
CREATE UNIQUE INDEX IF NOT EXISTS direct_clients_client_code_unique_ci
  ON public.direct_clients (upper(client_code));

-- 3. direct_client_addresses
CREATE TABLE IF NOT EXISTS public.direct_client_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_client_id uuid NOT NULL REFERENCES public.direct_clients(id) ON DELETE CASCADE,
  label text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'USA',
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_direct_client_addresses_client ON public.direct_client_addresses(direct_client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_client_addresses TO authenticated;
GRANT ALL ON public.direct_client_addresses TO service_role;
ALTER TABLE public.direct_client_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal staff manage dc addresses" ON public.direct_client_addresses
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));
CREATE TRIGGER trg_direct_client_addresses_updated
  BEFORE UPDATE ON public.direct_client_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. direct_client_contacts (mirror of firm_contacts)
CREATE TABLE IF NOT EXISTS public.direct_client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_client_id uuid NOT NULL REFERENCES public.direct_clients(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role_title text,
  email text,
  phone text,
  notes text,
  portal_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_direct_client_contacts_client ON public.direct_client_contacts(direct_client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_client_contacts TO authenticated;
GRANT ALL ON public.direct_client_contacts TO service_role;
ALTER TABLE public.direct_client_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal manage dc contacts" ON public.direct_client_contacts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));
CREATE POLICY "Portal client reads own dc contacts" ON public.direct_client_contacts
  FOR SELECT TO authenticated
  USING (portal_enabled = true AND EXISTS (
    SELECT 1 FROM public.direct_clients dc
    WHERE dc.id = direct_client_contacts.direct_client_id AND dc.portal_user_id = auth.uid()
  ));
CREATE TRIGGER trg_direct_client_contacts_updated
  BEFORE UPDATE ON public.direct_client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. direct_client_contact_capabilities
CREATE TABLE IF NOT EXISTS public.direct_client_contact_capabilities (
  contact_id uuid NOT NULL REFERENCES public.direct_client_contacts(id) ON DELETE CASCADE,
  capability text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, capability)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_client_contact_capabilities TO authenticated;
GRANT ALL ON public.direct_client_contact_capabilities TO service_role;
ALTER TABLE public.direct_client_contact_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal manage dc contact caps" ON public.direct_client_contact_capabilities
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- 6. direct_client_internal_team
CREATE TABLE IF NOT EXISTS public.direct_client_internal_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_client_id uuid NOT NULL REFERENCES public.direct_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (direct_client_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dc_internal_team_client ON public.direct_client_internal_team(direct_client_id);
CREATE INDEX IF NOT EXISTS idx_dc_internal_team_user ON public.direct_client_internal_team(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_client_internal_team TO authenticated;
GRANT ALL ON public.direct_client_internal_team TO service_role;
ALTER TABLE public.direct_client_internal_team ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dc internal team" ON public.direct_client_internal_team
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Employees view dc internal team" ON public.direct_client_internal_team
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'employee'::app_role));

-- 7. direct_client_member_capabilities
CREATE TABLE IF NOT EXISTS public.direct_client_member_capabilities (
  direct_client_id uuid NOT NULL REFERENCES public.direct_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  capability text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (direct_client_id, user_id, capability)
);
CREATE INDEX IF NOT EXISTS idx_dc_capabilities_user ON public.direct_client_member_capabilities(user_id, direct_client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_client_member_capabilities TO authenticated;
GRANT ALL ON public.direct_client_member_capabilities TO service_role;
ALTER TABLE public.direct_client_member_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dc member caps" ON public.direct_client_member_capabilities
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Members read own dc caps" ON public.direct_client_member_capabilities
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 8. direct_client_lifecycle_events
CREATE TABLE IF NOT EXISTS public.direct_client_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_client_id uuid NOT NULL REFERENCES public.direct_clients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dc_lifecycle_client ON public.direct_client_lifecycle_events(direct_client_id, created_at DESC);
GRANT SELECT, INSERT ON public.direct_client_lifecycle_events TO authenticated;
GRANT ALL ON public.direct_client_lifecycle_events TO service_role;
ALTER TABLE public.direct_client_lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read dc lifecycle" ON public.direct_client_lifecycle_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins write dc lifecycle" ON public.direct_client_lifecycle_events
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- 9. direct_client_sharepoint_config (mirror firm_sharepoint_config shape)
CREATE TABLE IF NOT EXISTS public.direct_client_sharepoint_config (
  direct_client_id uuid PRIMARY KEY REFERENCES public.direct_clients(id) ON DELETE CASCADE,
  sp_site_id text,
  sp_site_url text,
  sp_drive_id text,
  sp_list_id text,
  provisioning_status text NOT NULL DEFAULT 'pending',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_client_sharepoint_config TO authenticated;
GRANT ALL ON public.direct_client_sharepoint_config TO service_role;
ALTER TABLE public.direct_client_sharepoint_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dc sharepoint" ON public.direct_client_sharepoint_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER trg_dc_sharepoint_updated
  BEFORE UPDATE ON public.direct_client_sharepoint_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. direct_client_task_pricing — per-client override of direct_client_task_types.default_pricing
CREATE TABLE IF NOT EXISTS public.direct_client_task_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_client_id uuid NOT NULL REFERENCES public.direct_clients(id) ON DELETE CASCADE,
  task_type_id uuid NOT NULL REFERENCES public.direct_client_task_types(id) ON DELETE CASCADE,
  billing_mode text NOT NULL DEFAULT 'flat' CHECK (billing_mode IN ('flat','hourly')),
  rate numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (direct_client_id, task_type_id)
);
CREATE INDEX IF NOT EXISTS idx_dc_task_pricing_client ON public.direct_client_task_pricing(direct_client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_client_task_pricing TO authenticated;
GRANT ALL ON public.direct_client_task_pricing TO service_role;
ALTER TABLE public.direct_client_task_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal manage dc task pricing" ON public.direct_client_task_pricing
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));
CREATE TRIGGER trg_dc_task_pricing_updated
  BEFORE UPDATE ON public.direct_client_task_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
