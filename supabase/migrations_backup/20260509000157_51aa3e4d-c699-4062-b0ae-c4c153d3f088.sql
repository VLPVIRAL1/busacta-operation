
DO $$ BEGIN
  CREATE TYPE public.asset_category AS ENUM ('laptop','desktop','monitor','phone','tablet','peripheral','furniture','software_license','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.asset_status AS ENUM ('in_stock','assigned','in_repair','retired','lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.internal_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag text UNIQUE NOT NULL,
  name text NOT NULL,
  category public.asset_category NOT NULL DEFAULT 'other',
  status public.asset_status NOT NULL DEFAULT 'in_stock',
  serial_number text,
  vendor text,
  location text,
  purchase_date date,
  purchase_cost numeric(12,2),
  warranty_expires_on date,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_assets_status_idx ON public.internal_assets (status);
CREATE INDEX IF NOT EXISTS internal_assets_assigned_to_idx ON public.internal_assets (assigned_to);

ALTER TABLE public.internal_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view assets" ON public.internal_assets;
CREATE POLICY "Staff can view assets" ON public.internal_assets
  FOR SELECT USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'hr_manager')
    OR public.has_role(auth.uid(),'employee')
  );

DROP POLICY IF EXISTS "Admins manage assets - insert" ON public.internal_assets;
CREATE POLICY "Admins manage assets - insert" ON public.internal_assets
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'hr_manager')
  );

DROP POLICY IF EXISTS "Admins manage assets - update" ON public.internal_assets;
CREATE POLICY "Admins manage assets - update" ON public.internal_assets
  FOR UPDATE USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'hr_manager')
  );

DROP POLICY IF EXISTS "Admins manage assets - delete" ON public.internal_assets;
CREATE POLICY "Admins manage assets - delete" ON public.internal_assets
  FOR DELETE USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
  );

DROP TRIGGER IF EXISTS trg_internal_assets_updated_at ON public.internal_assets;
CREATE TRIGGER trg_internal_assets_updated_at
  BEFORE UPDATE ON public.internal_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
