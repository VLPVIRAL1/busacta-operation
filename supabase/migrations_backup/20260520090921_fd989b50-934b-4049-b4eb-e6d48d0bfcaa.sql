-- direct_client_type enum
DO $$ BEGIN
  CREATE TYPE public.direct_client_type AS ENUM ('individual', 'business');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- direct_client_task_types
CREATE TABLE IF NOT EXISTS public.direct_client_task_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  label           text NOT NULL,
  default_pricing numeric(14,2),
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_client_task_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read task types" ON public.direct_client_task_types;
CREATE POLICY "Authenticated read task types"
  ON public.direct_client_task_types FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage task types" ON public.direct_client_task_types;
CREATE POLICY "Admins manage task types"
  ON public.direct_client_task_types
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.direct_client_task_types (code, label, sort_order) VALUES
  ('1040_personal', '1040 Personal Tax', 10),
  ('1120_corporate', '1120 Corporate Tax', 20),
  ('1120s_s_corp', '1120-S S-Corp Tax', 30),
  ('1065_partnership', '1065 Partnership Tax', 40),
  ('bookkeeping', 'Bookkeeping', 50),
  ('sales_tax', 'Sales Tax Filing', 60),
  ('payroll', 'Payroll Processing', 70),
  ('advisory', 'Advisory / Consulting', 80),
  ('tax_planning', 'Tax Planning', 90),
  ('financial_statements', 'Financial Statements', 100)
ON CONFLICT (code) DO NOTHING;

-- direct_clients
CREATE TABLE IF NOT EXISTS public.direct_clients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name     text NOT NULL,
  legal_name       text,
  email            text NOT NULL,
  phone            text,
  client_type      public.direct_client_type NOT NULL DEFAULT 'individual',
  identifier       text,
  portal_user_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  owner_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes            text,
  provisioned_via  text NOT NULL DEFAULT 'direct_client_hub',
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_direct_clients_portal_user ON public.direct_clients(portal_user_id);
CREATE INDEX IF NOT EXISTS idx_direct_clients_owner ON public.direct_clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_direct_clients_status ON public.direct_clients(status);

ALTER TABLE public.direct_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal staff manage direct clients" ON public.direct_clients;
CREATE POLICY "Internal staff manage direct clients"
  ON public.direct_clients
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'employee'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'employee'::app_role)
  );

DROP POLICY IF EXISTS "Portal user reads own client" ON public.direct_clients;
CREATE POLICY "Portal user reads own client"
  ON public.direct_clients FOR SELECT
  USING (portal_user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_direct_clients_updated_at ON public.direct_clients;
CREATE TRIGGER trg_direct_clients_updated_at
  BEFORE UPDATE ON public.direct_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_direct_client_task_types_updated_at ON public.direct_client_task_types;
CREATE TRIGGER trg_direct_client_task_types_updated_at
  BEFORE UPDATE ON public.direct_client_task_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- tasks: flatten hierarchy
ALTER TABLE public.tasks ALTER COLUMN entity_id DROP NOT NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS direct_client_id uuid REFERENCES public.direct_clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS task_type_id     uuid REFERENCES public.direct_client_task_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stream           text NOT NULL DEFAULT 'cpa',
  ADD COLUMN IF NOT EXISTS source_organizer_deployment_id uuid REFERENCES public.organizer_deployments(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_stream_check CHECK (stream IN ('cpa','direct'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_parent_xor CHECK (
    (stream = 'cpa'    AND entity_id IS NOT NULL AND direct_client_id IS NULL)
    OR
    (stream = 'direct' AND direct_client_id IS NOT NULL AND entity_id IS NULL AND project_id IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_direct_client ON public.tasks(direct_client_id) WHERE direct_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_stream ON public.tasks(stream);
CREATE INDEX IF NOT EXISTS idx_tasks_source_organizer ON public.tasks(source_organizer_deployment_id) WHERE source_organizer_deployment_id IS NOT NULL;

-- tasks RLS: direct stream portal access
DROP POLICY IF EXISTS "Direct client portal reads own tasks" ON public.tasks;
CREATE POLICY "Direct client portal reads own tasks"
  ON public.tasks FOR SELECT
  USING (
    stream = 'direct'
    AND direct_client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.direct_clients dc
      WHERE dc.id = tasks.direct_client_id
        AND dc.portal_user_id = auth.uid()
    )
  );

-- organizer_deployments: portal access for direct clients
DROP POLICY IF EXISTS "Direct client portal reads own deployments" ON public.organizer_deployments;
CREATE POLICY "Direct client portal reads own deployments"
  ON public.organizer_deployments FOR SELECT
  USING (
    target_type = 'direct_client'
    AND EXISTS (
      SELECT 1 FROM public.direct_clients dc
      WHERE dc.id = organizer_deployments.target_id
        AND dc.portal_user_id = auth.uid()
    )
  );

-- profiles.provisioned_via allow-list
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_provisioned_via_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_provisioned_via_check
  CHECK (provisioned_via = ANY (ARRAY['firm_hub','hr_hub','self_signup','legacy','direct_client_hub']::text[]));

-- Auto-link submitted direct-client organizer to its task
CREATE OR REPLACE FUNCTION public.on_organizer_submitted_link_to_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_task_id uuid;
BEGIN
  IF NEW.target_type <> 'direct_client' THEN RETURN NEW; END IF;
  IF NEW.status <> 'submitted' OR (OLD.status = NEW.status) THEN RETURN NEW; END IF;
  SELECT id INTO v_task_id FROM public.tasks WHERE source_organizer_deployment_id = NEW.id LIMIT 1;
  IF v_task_id IS NOT NULL THEN
    UPDATE public.tasks
    SET status = 'ready_for_review', ready_for_review_at = COALESCE(ready_for_review_at, now())
    WHERE id = v_task_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizer_submitted_link_task ON public.organizer_deployments;
CREATE TRIGGER trg_organizer_submitted_link_task
  AFTER UPDATE OF status ON public.organizer_deployments
  FOR EACH ROW EXECUTE FUNCTION public.on_organizer_submitted_link_to_task();