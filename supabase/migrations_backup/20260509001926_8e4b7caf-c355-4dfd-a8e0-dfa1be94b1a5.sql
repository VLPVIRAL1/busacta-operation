
CREATE TYPE public.key_type AS ENUM ('key', 'card', 'fob', 'code');
CREATE TYPE public.key_status AS ENUM ('available', 'checked_out', 'lost', 'retired');

CREATE TABLE public.office_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  type public.key_type NOT NULL DEFAULT 'key',
  location TEXT,
  status public.key_status NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.office_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read keys"
  ON public.office_keys FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/HR manage keys"
  ON public.office_keys FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE TRIGGER office_keys_updated_at
  BEFORE UPDATE ON public.office_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.office_key_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES public.office_keys(id) ON DELETE CASCADE,
  holder_id UUID NOT NULL,
  checked_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_return_date DATE,
  returned_at TIMESTAMPTZ,
  condition_notes TEXT,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.office_key_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or admin/hr"
  ON public.office_key_assignments FOR SELECT
  USING (
    holder_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Admin/HR manage assignments"
  ON public.office_key_assignments FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE TRIGGER office_key_assignments_updated_at
  BEFORE UPDATE ON public.office_key_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX office_key_assignments_key_idx ON public.office_key_assignments(key_id, checked_out_at DESC);
CREATE INDEX office_key_assignments_holder_idx ON public.office_key_assignments(holder_id);
