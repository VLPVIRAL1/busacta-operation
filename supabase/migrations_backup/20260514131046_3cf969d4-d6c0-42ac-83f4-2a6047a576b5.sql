
-- Incident response tabletop records
CREATE TABLE public.incident_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  detected_at timestamptz,
  resolved_at timestamptz,
  severity text NOT NULL CHECK (severity IN ('SEV-1','SEV-2','SEV-3','tabletop')),
  scenario text NOT NULL,
  summary text NOT NULL,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions_taken text,
  post_mortem text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','contained','resolved','closed')),
  is_tabletop boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incident_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read incidents" ON public.incident_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admins insert incidents" ON public.incident_records FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admins update incidents" ON public.incident_records FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_incident_records_updated_at BEFORE UPDATE ON public.incident_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_incident_records_audit AFTER INSERT OR UPDATE OR DELETE ON public.incident_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

-- Quarterly access-review schedule
CREATE TABLE public.access_review_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  next_due_at timestamptz NOT NULL,
  last_completed_at timestamptz,
  last_completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.access_review_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read access review" ON public.access_review_schedule FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "super_admin manage access review" ON public.access_review_schedule FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.access_review_schedule (next_due_at)
  VALUES (now() + INTERVAL '90 days');
