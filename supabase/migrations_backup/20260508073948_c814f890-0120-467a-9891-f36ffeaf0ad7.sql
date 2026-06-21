
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'employee', 'client');
CREATE TYPE public.task_status AS ENUM ('draft', 'in_progress', 'review', 'waiting_client', 'complete');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.entity_type AS ENUM ('individual', 'business');
CREATE TYPE public.template_type AS ENUM ('form_1065', 'form_1120s', 'form_1120', 'form_1040', 'none');
CREATE TYPE public.tax_software AS ENUM ('lacerte', 'drake', 'cch_axcess', 'ultratax', 'proconnect', 'other');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  firm_id UUID,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- get user's primary role (admin > employee > client)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'employee' THEN 2 WHEN 'client' THEN 3 END
  LIMIT 1
$$;

-- FIRMS
CREATE TABLE public.firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  primary_partner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_firm_fk FOREIGN KEY (firm_id) REFERENCES public.firms(id) ON DELETE SET NULL;

-- PROJECTS
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_year INTEGER,
  template public.template_type NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- CLIENT ENTITIES
CREATE TABLE public.client_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type public.entity_type NOT NULL DEFAULT 'individual',
  identifier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_entities ENABLE ROW LEVEL SECURITY;

-- TASKS
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.client_entities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  tax_year INTEGER,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  software public.tax_software,
  due_date DATE,
  status public.task_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ready_for_review_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- TASK MESSAGES
CREATE TABLE public.task_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_client_visible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.task_messages ENABLE ROW LEVEL SECURITY;

-- TASK ATTACHMENTS
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.task_messages(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- TIME LOGS
CREATE TABLE public.time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  billable BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;

-- TASK AUDIT
CREATE TABLE public.task_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_audit ENABLE ROW LEVEL SECURITY;

-- WORKFLOW TEMPLATES
CREATE TABLE public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template public.template_type NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT
);
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.template_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template public.template_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.template_checklist_items ENABLE ROW LEVEL SECURITY;

-- INVITATIONS
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role public.app_role NOT NULL,
  firm_id UUID REFERENCES public.firms(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: is user a member of firm (admin, employee, or client owning the firm)
CREATE OR REPLACE FUNCTION public.user_can_access_firm(_firm_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'employee')
    OR EXISTS (SELECT 1 FROM public.firms WHERE id = _firm_id AND primary_partner_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND firm_id = _firm_id);
$$;

-- ============================ RLS POLICIES ============================

-- profiles
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employees read all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(),'employee'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(),'admin'));

-- user_roles (only admins manage; users can read own roles)
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- firms
CREATE POLICY "Admins manage firms" ON public.firms FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employees read firms" ON public.firms FOR SELECT USING (public.has_role(auth.uid(),'employee'));
CREATE POLICY "Clients read own firm" ON public.firms FOR SELECT USING (
  primary_partner_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND firm_id = firms.id)
);

-- projects
CREATE POLICY "Admins manage projects" ON public.projects FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employees manage projects" ON public.projects FOR ALL USING (public.has_role(auth.uid(),'employee')) WITH CHECK (public.has_role(auth.uid(),'employee'));
CREATE POLICY "Clients read own firm projects" ON public.projects FOR SELECT USING (public.user_can_access_firm(firm_id));

-- client_entities
CREATE POLICY "Internal manage entities" ON public.client_entities FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));
CREATE POLICY "Clients read entities" ON public.client_entities FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.user_can_access_firm(p.firm_id))
);

-- tasks
CREATE POLICY "Internal manage tasks" ON public.tasks FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));
CREATE POLICY "Clients read firm tasks" ON public.tasks FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.client_entities ce JOIN public.projects p ON p.id = ce.project_id
    WHERE ce.id = entity_id AND public.user_can_access_firm(p.firm_id)
  )
);

-- task_messages
CREATE POLICY "Internal read messages" ON public.task_messages FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee')
);
CREATE POLICY "Clients read visible messages" ON public.task_messages FOR SELECT USING (
  is_client_visible = true AND deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_id AND public.user_can_access_firm(p.firm_id)
  )
);
CREATE POLICY "Authors insert messages" ON public.task_messages FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "Authors update own messages" ON public.task_messages FOR UPDATE USING (author_id = auth.uid());

-- task_attachments
CREATE POLICY "Internal manage attachments" ON public.task_attachments FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));
CREATE POLICY "Clients read attachments on visible msgs" ON public.task_attachments FOR SELECT USING (
  message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.task_messages m WHERE m.id = message_id AND m.is_client_visible = true AND m.deleted_at IS NULL
  )
);

-- time_logs
CREATE POLICY "Users manage own time" ON public.time_logs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins read all time" ON public.time_logs FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Employees read time" ON public.time_logs FOR SELECT USING (public.has_role(auth.uid(),'employee'));

-- task_audit
CREATE POLICY "Internal read audit" ON public.task_audit FOR SELECT USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee')
);
CREATE POLICY "Internal write audit" ON public.task_audit FOR INSERT WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee')
);
CREATE POLICY "Clients limited audit" ON public.task_audit FOR SELECT USING (
  event_type IN ('status_changed','assignee_changed') AND EXISTS (
    SELECT 1 FROM public.tasks t JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_id AND public.user_can_access_firm(p.firm_id)
  )
);

-- workflow_templates / checklist (read all authenticated; admin manage)
CREATE POLICY "Auth read templates" ON public.workflow_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage templates" ON public.workflow_templates FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Auth read checklist" ON public.template_checklist_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage checklist" ON public.template_checklist_items FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- invitations
CREATE POLICY "Admins manage invitations" ON public.invitations FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================ SEED TEMPLATES ============================
INSERT INTO public.workflow_templates (template, name, description) VALUES
  ('form_1065','Form 1065 (Partnership)','Partnership tax return checklist'),
  ('form_1120s','Form 1120-S (S-Corp)','S-Corporation tax return checklist'),
  ('form_1120','Form 1120 (C-Corp)','C-Corporation tax return checklist'),
  ('form_1040','Form 1040 (Individual)','Individual tax return checklist');

INSERT INTO public.template_checklist_items (template, title, sort_order) VALUES
  ('form_1065','PY Reconciliation',1),
  ('form_1065','M-1/M-3 Review',2),
  ('form_1065','Partner Basis',3),
  ('form_1065','QBI Validation',4),
  ('form_1120s','Shareholder Basis',1),
  ('form_1120s','Officer Comp W-2 Verify',2),
  ('form_1120s','AAA Update',3),
  ('form_1120s','State Apportionment',4),
  ('form_1120','Tax Provision',1),
  ('form_1120','Sec 179 / Bonus Depreciation',2),
  ('form_1120','NOL Carryforward',3),
  ('form_1040','1099/W-2 Reconciliation',1),
  ('form_1040','Sch C/E Analysis',2),
  ('form_1040','Tax Summary Variance',3);
