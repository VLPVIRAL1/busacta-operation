
-- ============ clients ============
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'client' CHECK (kind IN ('client','group')),
  parent_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_firm ON public.clients(firm_id);
CREATE INDEX idx_clients_parent ON public.clients(parent_id);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm members read clients"
  ON public.clients FOR SELECT
  USING (public.user_can_access_firm(firm_id));

CREATE POLICY "Internal manage clients"
  ON public.clients FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'));

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ tasks.client_id ============
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_client ON public.tasks(client_id);

-- ============ firm_messages ============
CREATE TABLE public.firm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  is_client_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX idx_firm_messages_firm ON public.firm_messages(firm_id, created_at DESC);

ALTER TABLE public.firm_messages ENABLE ROW LEVEL SECURITY;

-- Internal (admin/employee) read everything
CREATE POLICY "Internal read firm_messages"
  ON public.firm_messages FOR SELECT
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'))
    AND deleted_at IS NULL
  );

-- Clients/partners read only client-visible messages of their firm
CREATE POLICY "Firm members read visible firm_messages"
  ON public.firm_messages FOR SELECT
  USING (
    is_client_visible = true
    AND deleted_at IS NULL
    AND public.user_can_access_firm(firm_id)
  );

-- Anyone who can see the firm can post; clients must post visible
CREATE POLICY "Firm members insert firm_messages"
  ON public.firm_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND public.user_can_access_firm(firm_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'employee')
      OR is_client_visible = true
    )
  );

-- Authors edit their own message body within 30 minutes
CREATE POLICY "Authors update own firm_messages"
  ON public.firm_messages FOR UPDATE
  USING (author_id = auth.uid() AND created_at > now() - interval '30 minutes')
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Admins update firm_messages"
  ON public.firm_messages FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete firm_messages"
  ON public.firm_messages FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ task_messages: open up posting to all firm members ============
DROP POLICY IF EXISTS "Authors insert messages" ON public.task_messages;
CREATE POLICY "Firm members insert task_messages"
  ON public.task_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = ce.project_id
      WHERE t.id = task_messages.task_id
        AND public.user_can_access_firm(p.firm_id)
    )
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'employee')
      OR is_client_visible = true
    )
  );

-- ============ time_logs: let clients read their firm's time logs ============
CREATE POLICY "Firm members read time_logs"
  ON public.time_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = ce.project_id
      WHERE t.id = time_logs.task_id
        AND public.user_can_access_firm(p.firm_id)
    )
  );

-- ============ role_capabilities ============
CREATE TABLE public.role_capabilities (
  role public.app_role NOT NULL,
  capability text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, capability)
);

ALTER TABLE public.role_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read capabilities"
  ON public.role_capabilities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage capabilities"
  ON public.role_capabilities FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed defaults
INSERT INTO public.role_capabilities (role, capability, allowed) VALUES
  ('admin','firms.create',true),('admin','firms.edit',true),('admin','firms.delete',true),
  ('admin','projects.create',true),('admin','projects.edit',true),('admin','projects.delete',true),
  ('admin','clients.create',true),('admin','clients.edit',true),('admin','clients.delete',true),
  ('admin','tasks.create',true),('admin','tasks.edit',true),('admin','tasks.delete',true),
  ('admin','subtasks.manage',true),('admin','templates.manage',true),
  ('admin','people.invite',true),('admin','people.manage',true),
  ('admin','timesheet.view_all',true),('admin','communication.post_internal',true),
  ('employee','firms.create',false),('employee','firms.edit',true),('employee','firms.delete',false),
  ('employee','projects.create',true),('employee','projects.edit',true),('employee','projects.delete',false),
  ('employee','clients.create',true),('employee','clients.edit',true),('employee','clients.delete',false),
  ('employee','tasks.create',true),('employee','tasks.edit',true),('employee','tasks.delete',false),
  ('employee','subtasks.manage',true),('employee','templates.manage',false),
  ('employee','people.invite',false),('employee','people.manage',false),
  ('employee','timesheet.view_all',true),('employee','communication.post_internal',true),
  ('client','firms.create',false),('client','firms.edit',false),('client','firms.delete',false),
  ('client','projects.create',false),('client','projects.edit',false),('client','projects.delete',false),
  ('client','clients.create',false),('client','clients.edit',false),('client','clients.delete',false),
  ('client','tasks.create',false),('client','tasks.edit',false),('client','tasks.delete',false),
  ('client','subtasks.manage',false),('client','templates.manage',false),
  ('client','people.invite',false),('client','people.manage',false),
  ('client','timesheet.view_all',false),('client','communication.post_internal',false)
ON CONFLICT (role, capability) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_capability(_user_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_capabilities rc ON rc.role = ur.role
    WHERE ur.user_id = _user_id
      AND rc.capability = _capability
      AND rc.allowed = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_capability(uuid, text) TO anon, authenticated;
