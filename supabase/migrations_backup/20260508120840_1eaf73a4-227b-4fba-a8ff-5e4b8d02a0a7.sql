-- Helper used by updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ===== Firm profile additions =====
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS software public.software_type[] NOT NULL DEFAULT '{}';

-- ===== Project profile additions =====
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS software public.software_type[] NOT NULL DEFAULT '{}';

-- ===== Firm-side (client) team contacts =====
CREATE TABLE IF NOT EXISTS public.firm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  full_name text NOT NULL,
  role_title text,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_firm_contacts_firm ON public.firm_contacts(firm_id);
ALTER TABLE public.firm_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage firm_contacts" ON public.firm_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));

CREATE POLICY "Clients read own firm contacts" ON public.firm_contacts
  FOR SELECT TO authenticated
  USING (public.user_can_access_firm(firm_id));

-- ===== Internal (offshore) team =====
CREATE TABLE IF NOT EXISTS public.firm_internal_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_firm_internal_team_firm ON public.firm_internal_team(firm_id);
ALTER TABLE public.firm_internal_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage firm_internal_team" ON public.firm_internal_team
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));

-- ===== SOPs =====
CREATE TABLE IF NOT EXISTS public.sops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid,
  project_id uuid,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_internal boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sops_scope_chk CHECK (firm_id IS NOT NULL OR project_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sops_firm ON public.sops(firm_id);
CREATE INDEX IF NOT EXISTS idx_sops_project ON public.sops(project_id);
ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage sops" ON public.sops
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));

CREATE POLICY "Clients read non-internal sops" ON public.sops
  FOR SELECT TO authenticated
  USING (
    is_internal = false AND (
      (firm_id IS NOT NULL AND public.user_can_access_firm(firm_id))
      OR (project_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.projects p WHERE p.id = sops.project_id AND public.user_can_access_firm(p.firm_id)
      ))
    )
  );

-- ===== Entity notes =====
CREATE TABLE IF NOT EXISTS public.entity_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid,
  project_id uuid,
  title text,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  is_internal boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_notes_scope_chk CHECK (firm_id IS NOT NULL OR project_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_entity_notes_firm ON public.entity_notes(firm_id);
CREATE INDEX IF NOT EXISTS idx_entity_notes_project ON public.entity_notes(project_id);
ALTER TABLE public.entity_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage notes" ON public.entity_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));

CREATE POLICY "Clients read non-internal notes" ON public.entity_notes
  FOR SELECT TO authenticated
  USING (
    is_internal = false AND (
      (firm_id IS NOT NULL AND public.user_can_access_firm(firm_id))
      OR (project_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.projects p WHERE p.id = entity_notes.project_id AND public.user_can_access_firm(p.firm_id)
      ))
    )
  );

-- ===== Multiple assignees & watchers =====
CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON public.task_assignees(user_id);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal manage task_assignees" ON public.task_assignees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));
CREATE POLICY "Clients read task_assignees of accessible tasks" ON public.task_assignees
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_assignees.task_id AND public.user_can_access_firm(p.firm_id)
  ));

CREATE TABLE IF NOT EXISTS public.task_watchers (
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_watchers_user ON public.task_watchers(user_id);
ALTER TABLE public.task_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal manage task_watchers" ON public.task_watchers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));
CREATE POLICY "Users read own watcher rows" ON public.task_watchers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ===== Notifications =====
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  task_id uuid,
  project_id uuid,
  firm_id uuid,
  url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at NULLS FIRST, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Internal create notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));

-- ===== updated_at triggers =====
DROP TRIGGER IF EXISTS trg_firm_contacts_updated ON public.firm_contacts;
CREATE TRIGGER trg_firm_contacts_updated BEFORE UPDATE ON public.firm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sops_updated ON public.sops;
CREATE TRIGGER trg_sops_updated BEFORE UPDATE ON public.sops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_entity_notes_updated ON public.entity_notes;
CREATE TRIGGER trg_entity_notes_updated BEFORE UPDATE ON public.entity_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();