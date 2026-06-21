
-- ============================================================================
-- 1. SCHEMA CHANGES
-- ============================================================================

-- Sub-task: assignee, due date, status
DO $$ BEGIN
  CREATE TYPE public.subtask_status AS ENUM ('todo', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.task_subtasks
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS status public.subtask_status NOT NULL DEFAULT 'todo';

-- Keep is_done in sync with status
CREATE OR REPLACE FUNCTION public.sync_subtask_status_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.is_done IS DISTINCT FROM OLD.is_done THEN
    -- If status changed, derive is_done. If is_done toggled, derive status.
    IF TG_OP = 'UPDATE' AND NEW.is_done IS DISTINCT FROM OLD.is_done AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      NEW.status := CASE WHEN NEW.is_done THEN 'done'::subtask_status ELSE 'todo'::subtask_status END;
    ELSE
      NEW.is_done := (NEW.status = 'done');
    END IF;
    IF NEW.is_done AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    ELSIF NOT NEW.is_done THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subtask_sync_status ON public.task_subtasks;
CREATE TRIGGER trg_subtask_sync_status
  BEFORE INSERT OR UPDATE ON public.task_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_subtask_status_done();

-- Task notes
CREATE TABLE IF NOT EXISTS public.task_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_notes_task ON public.task_notes(task_id);

ALTER TABLE public.task_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal manage task_notes" ON public.task_notes;
CREATE POLICY "Internal manage task_notes" ON public.task_notes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'employee'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'employee'::app_role));

DROP POLICY IF EXISTS "Firm members read task_notes" ON public.task_notes;
CREATE POLICY "Firm members read task_notes" ON public.task_notes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN client_entities ce ON ce.id = t.entity_id
    JOIN projects p ON p.id = ce.project_id
    WHERE t.id = task_notes.task_id AND user_can_access_firm(p.firm_id)
  ));

DROP TRIGGER IF EXISTS trg_task_notes_updated ON public.task_notes;
CREATE TRIGGER trg_task_notes_updated
  BEFORE UPDATE ON public.task_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Task links
DO $$ BEGIN
  CREATE TYPE public.link_type AS ENUM ('knowledge_hub','sharepoint','client_portal','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.task_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  url text NOT NULL,
  description text,
  link_type public.link_type NOT NULL DEFAULT 'other',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_links_task ON public.task_links(task_id);

ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal manage task_links" ON public.task_links;
CREATE POLICY "Internal manage task_links" ON public.task_links
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'employee'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'employee'::app_role));

DROP POLICY IF EXISTS "Firm members read task_links" ON public.task_links;
CREATE POLICY "Firm members read task_links" ON public.task_links
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN client_entities ce ON ce.id = t.entity_id
    JOIN projects p ON p.id = ce.project_id
    WHERE t.id = task_links.task_id AND user_can_access_firm(p.firm_id)
  ));

CREATE INDEX IF NOT EXISTS idx_task_messages_open_point
  ON public.task_messages(task_id) WHERE is_open_point AND deleted_at IS NULL;

-- ============================================================================
-- 2. WIPE OPERATIONAL DATA
-- ============================================================================

TRUNCATE TABLE
  public.task_audit,
  public.task_messages,
  public.task_attachments,
  public.task_subtasks,
  public.task_assignees,
  public.task_watchers,
  public.task_notes,
  public.task_links,
  public.time_logs,
  public.tasks,
  public.client_entities,
  public.projects,
  public.clients,
  public.firm_messages,
  public.firm_contacts,
  public.firm_internal_team,
  public.entity_notes,
  public.sops,
  public.notifications,
  public.firms
RESTART IDENTITY CASCADE;

-- ============================================================================
-- 3. RESEED with random timestamps over the last 90 days
-- ============================================================================

-- Helper: random user ids array
DO $$
DECLARE
  user_ids uuid[];
  internal_ids uuid[];
  client_id_partner uuid;
  firm_rec record;
  proj_rec record;
  ent_rec record;
  task_rec record;
  client_rec record;
  group_id uuid;
  i int;
  j int;
  k int;
  num_clients int;
  num_groups int;
  num_projects int;
  num_tasks int;
  num_subs int;
  num_msgs int;
  num_notes int;
  num_links int;
  num_logs int;
  rand_status text;
  rand_priority text;
  rand_pipeline text;
  rand_proj_type text;
  rand_template text;
  rand_software text;
  msg_body text;
  ts timestamptz;
  ended_at timestamptz;
  duration_min int;
  link_kinds text[] := ARRAY['knowledge_hub','sharepoint','client_portal','other'];
  statuses text[] := ARRAY['draft','in_progress','review','waiting_client','complete'];
  priorities text[] := ARRAY['low','medium','high'];
  pipelines text[] := ARRAY['handover_received','in_prep','internal_qc','waiting_cpa','ready_for_delivery','final_signoff'];
  proj_types text[] := ARRAY['accounting','tax_preparation','sales_tax','company_formation','payroll_processing','other'];
  templates text[] := ARRAY['form_1065','form_1120s','form_1120','form_1040','none'];
  softwares text[] := ARRAY['lacerte','drake','cch_axcess','ultratax','proconnect','other'];
  firm_names text[] := ARRAY['Sterling Brooks CPA','Riverstone Tax Group','Apex Advisory Partners','Magnolia Accounting'];
  group_names text[] := ARRAY['Premium Accounts','Mid-Market','Growth Stage','Strategic Partners'];
  client_first text[] := ARRAY['Acme','Blue','Crescent','Delta','Evergreen','Fairview','Granite','Harbor','Iris','Juniper','Keystone','Lighthouse','Maple','Nexus','Orion','Pinnacle'];
  client_last text[] := ARRAY['Holdings LLC','Industries Inc','Group LLC','Ventures','Capital','Partners','Solutions','Co','Trust','Foundation','Enterprises','Brands'];
BEGIN
  -- Collect users
  SELECT array_agg(id) INTO user_ids FROM public.profiles;
  IF user_ids IS NULL OR array_length(user_ids,1) = 0 THEN
    RAISE NOTICE 'No users found, abort seed';
    RETURN;
  END IF;

  SELECT array_agg(p.id) INTO internal_ids
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('admin','employee');
  IF internal_ids IS NULL OR array_length(internal_ids,1) = 0 THEN
    internal_ids := user_ids;
  END IF;

  -- Pick a partner user (first non-internal client, else first user)
  SELECT p.id INTO client_id_partner
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'client'
  LIMIT 1;
  IF client_id_partner IS NULL THEN
    client_id_partner := user_ids[1];
  END IF;

  -- 4 firms
  FOR i IN 1..4 LOOP
    INSERT INTO public.firms (name, primary_partner_user_id, contact_email, contact_phone, address, us_timezone, created_at)
    VALUES (
      firm_names[i],
      client_id_partner,
      lower(replace(firm_names[i],' ','')) || '@example.com',
      '+1-555-' || lpad((100 + i*37)::text,4,'0'),
      (100 + i*11) || ' Main St, Suite ' || (i*100) || ', NY',
      (ARRAY['America/New_York','America/Chicago','America/Los_Angeles'])[1 + (i % 3)],
      now() - (random()*60 || ' days')::interval
    );
  END LOOP;

  FOR firm_rec IN SELECT id, name FROM public.firms LOOP
    -- 3 client groups per firm
    num_groups := 3;
    FOR j IN 1..num_groups LOOP
      INSERT INTO public.clients (firm_id, name, kind, sort_order, created_at)
      VALUES (firm_rec.id, group_names[j], 'group', j, now() - (random()*80 || ' days')::interval);
    END LOOP;

    -- 3-5 individual clients per firm, ~70% under a group
    num_clients := 3 + floor(random()*3)::int;
    FOR j IN 1..num_clients LOOP
      group_id := NULL;
      IF random() < 0.7 THEN
        SELECT id INTO group_id FROM public.clients
          WHERE firm_id = firm_rec.id AND kind = 'group'
          ORDER BY random() LIMIT 1;
      END IF;
      INSERT INTO public.clients (firm_id, name, kind, parent_id, sort_order, created_at)
      VALUES (
        firm_rec.id,
        client_first[1 + floor(random()*array_length(client_first,1))::int] || ' ' ||
        client_last[1 + floor(random()*array_length(client_last,1))::int],
        'client',
        group_id,
        j,
        now() - (random()*70 || ' days')::interval
      );
    END LOOP;

    -- 3 projects per firm
    num_projects := 3;
    FOR j IN 1..num_projects LOOP
      rand_proj_type := proj_types[1 + floor(random()*array_length(proj_types,1))::int];
      INSERT INTO public.projects (firm_id, name, project_type, software, status, created_at)
      VALUES (
        firm_rec.id,
        initcap(replace(rand_proj_type,'_',' ')) || ' — ' || (2024 + (j%2))::text,
        rand_proj_type::project_type,
        ARRAY[softwares[1 + floor(random()*array_length(softwares,1))::int]]::software_type[],
        'active',
        now() - (random()*60 || ' days')::interval
      );
    END LOOP;
  END LOOP;

  -- One default client_entity per project
  FOR proj_rec IN SELECT id, name, firm_id FROM public.projects LOOP
    INSERT INTO public.client_entities (project_id, name, entity_type, software, identifier, created_at)
    VALUES (
      proj_rec.id,
      proj_rec.name || ' Entity',
      (CASE WHEN random() < 0.5 THEN 'individual' ELSE 'business' END)::entity_type,
      ARRAY[]::software_type[],
      'EIN-' || lpad(floor(random()*99999999)::text,8,'0'),
      now() - (random()*55 || ' days')::interval
    );
  END LOOP;

  -- 10-15 tasks per firm spread across that firm's entities
  FOR firm_rec IN SELECT id FROM public.firms LOOP
    num_tasks := 10 + floor(random()*6)::int;
    FOR i IN 1..num_tasks LOOP
      SELECT ce.id, ce.project_id INTO ent_rec
      FROM public.client_entities ce
      JOIN public.projects p ON p.id = ce.project_id
      WHERE p.firm_id = firm_rec.id
      ORDER BY random() LIMIT 1;

      rand_status := statuses[1 + floor(random()*array_length(statuses,1))::int];
      rand_priority := priorities[1 + floor(random()*array_length(priorities,1))::int];
      rand_pipeline := pipelines[1 + floor(random()*array_length(pipelines,1))::int];
      rand_template := templates[1 + floor(random()*array_length(templates,1))::int];
      rand_software := softwares[1 + floor(random()*array_length(softwares,1))::int];

      ts := now() - (random()*90 || ' days')::interval - (random()*86400 || ' seconds')::interval;

      INSERT INTO public.tasks (
        entity_id, title, description, status, priority, pipeline_stage,
        software, template, due_date, tax_year,
        assignee_id, reviewer_id, client_id, created_by, created_at,
        sharepoint_url
      )
      SELECT
        ent_rec.id,
        (ARRAY['Prep','Review','QC','Filing','Reconciliation','Workpapers'])[1+floor(random()*6)::int]
          || ' — ' || (ARRAY['Q1','Q2','Q3','Q4','Annual','Monthly'])[1+floor(random()*6)::int]
          || ' ' || (2023 + floor(random()*3)::int)::text,
        'Auto-generated test task. ' || (ARRAY['Verify trial balance.','Review depreciation schedules.','Reconcile bank accounts.','Prepare federal return.','Coordinate with client for missing docs.'])[1+floor(random()*5)::int],
        rand_status::task_status,
        rand_priority::task_priority,
        rand_pipeline::pipeline_stage,
        CASE WHEN random() < 0.7 THEN rand_software::software_type ELSE NULL END,
        CASE WHEN rand_template <> 'none' THEN rand_template::template_type ELSE NULL END,
        (now() + ((floor(random()*90)::int - 30) || ' days')::interval)::date,
        CASE WHEN random()<0.6 THEN 2023 + floor(random()*3)::int ELSE NULL END,
        internal_ids[1 + floor(random()*array_length(internal_ids,1))::int],
        internal_ids[1 + floor(random()*array_length(internal_ids,1))::int],
        (SELECT id FROM public.clients WHERE firm_id = firm_rec.id AND kind='client' ORDER BY random() LIMIT 1),
        internal_ids[1 + floor(random()*array_length(internal_ids,1))::int],
        ts,
        CASE WHEN random()<0.4 THEN 'https://sharepoint.example.com/sites/firm/' || gen_random_uuid()::text ELSE NULL END;
    END LOOP;
  END LOOP;

  -- Sub-tasks per task
  FOR task_rec IN SELECT id, created_at FROM public.tasks LOOP
    num_subs := 4 + floor(random()*5)::int;
    FOR i IN 1..num_subs LOOP
      INSERT INTO public.task_subtasks (task_id, title, status, assignee_id, due_date, created_by, created_at)
      VALUES (
        task_rec.id,
        (ARRAY['Gather source docs','Import trial balance','Reconcile accounts','Draft return','Internal review','Partner sign-off','Send to client','File return'])[1+floor(random()*8)::int],
        (ARRAY['todo','in_progress','done'])[1+floor(random()*3)::int]::subtask_status,
        CASE WHEN random()<0.7 THEN internal_ids[1 + floor(random()*array_length(internal_ids,1))::int] ELSE NULL END,
        CASE WHEN random()<0.5 THEN (now() + ((floor(random()*30)::int - 5) || ' days')::interval)::date ELSE NULL END,
        internal_ids[1 + floor(random()*array_length(internal_ids,1))::int],
        task_rec.created_at + (random()*86400 || ' seconds')::interval
      );
    END LOOP;
  END LOOP;

  -- Messages, notes, links per task
  FOR task_rec IN SELECT id, created_at FROM public.tasks LOOP
    -- Messages
    num_msgs := 5 + floor(random()*11)::int;
    FOR i IN 1..num_msgs LOOP
      msg_body := (ARRAY[
        'Pulled the latest trial balance, please review.',
        'Client confirmed the depreciation schedule.',
        'Need K-1 from the partner before we can proceed.',
        'Reconciled bank account, variance is $0.',
        'Filed extension. Will start prep next week.',
        'Reviewed and approved. Move to QC.',
        'Waiting on signed engagement letter.',
        'Updated workpapers in SharePoint.'
      ])[1 + floor(random()*8)::int];
      ts := task_rec.created_at + (random()*60*86400 || ' seconds')::interval;
      IF ts > now() THEN ts := now() - (random()*3600 || ' seconds')::interval; END IF;

      INSERT INTO public.task_messages (task_id, author_id, body, is_client_visible, is_open_point, resolved_at, created_at)
      VALUES (
        task_rec.id,
        user_ids[1 + floor(random()*array_length(user_ids,1))::int],
        msg_body,
        random() < 0.5,
        random() < 0.15,
        CASE WHEN random() < 0.4 THEN ts + (random()*5*86400 || ' seconds')::interval ELSE NULL END,
        ts
      );
    END LOOP;

    -- Notes
    num_notes := 1 + floor(random()*4)::int;
    FOR i IN 1..num_notes LOOP
      INSERT INTO public.task_notes (task_id, body, is_pinned, created_by, created_at)
      VALUES (
        task_rec.id,
        (ARRAY[
          'Client prefers email communication.',
          'Watch for state-specific PTET election.',
          'Use prior-year carryforward; see attached spreadsheet.',
          'Engagement is fixed-fee; track scope creep.'
        ])[1 + floor(random()*4)::int],
        random() < 0.25,
        internal_ids[1 + floor(random()*array_length(internal_ids,1))::int],
        task_rec.created_at + (random()*30*86400 || ' seconds')::interval
      );
    END LOOP;

    -- Links
    num_links := floor(random()*4)::int;
    FOR i IN 1..num_links LOOP
      INSERT INTO public.task_links (task_id, url, description, link_type, created_by, created_at)
      VALUES (
        task_rec.id,
        'https://example.com/' || link_kinds[1 + floor(random()*4)::int] || '/' || gen_random_uuid()::text,
        (ARRAY['Source docs','Working file','Client portal upload','Reference SOP'])[1 + floor(random()*4)::int],
        link_kinds[1 + floor(random()*4)::int]::link_type,
        internal_ids[1 + floor(random()*array_length(internal_ids,1))::int],
        task_rec.created_at + (random()*15*86400 || ' seconds')::interval
      );
    END LOOP;
  END LOOP;

  -- Time logs for each internal user
  FOREACH client_id_partner IN ARRAY internal_ids LOOP
    num_logs := 50 + floor(random()*100)::int;
    FOR i IN 1..num_logs LOOP
      SELECT id INTO task_rec.id FROM public.tasks ORDER BY random() LIMIT 1;
      ts := now() - (random()*90*86400 || ' seconds')::interval;
      duration_min := 15 + floor(random()*226)::int;
      ended_at := ts + (duration_min || ' minutes')::interval;
      INSERT INTO public.time_logs (task_id, user_id, started_at, ended_at, duration_minutes, billable, note, created_at)
      VALUES (
        task_rec.id,
        client_id_partner,
        ts,
        ended_at,
        duration_min,
        random() < 0.85,
        (ARRAY['Prep work','Client call','Review','Internal QC','Workpaper updates','Research'])[1 + floor(random()*6)::int],
        ended_at
      );
    END LOOP;
  END LOOP;

  -- Notifications
  FOREACH client_id_partner IN ARRAY user_ids LOOP
    FOR i IN 1..(10 + floor(random()*21)::int) LOOP
      SELECT id INTO task_rec.id FROM public.tasks ORDER BY random() LIMIT 1;
      INSERT INTO public.notifications (user_id, kind, title, body, task_id, url, created_at, read_at)
      VALUES (
        client_id_partner,
        (ARRAY['mention','assignment','status','message'])[1 + floor(random()*4)::int],
        (ARRAY['You were mentioned','Task assigned to you','Status changed','New message'])[1 + floor(random()*4)::int],
        'Test notification body for task',
        task_rec.id,
        '/tasks/' || task_rec.id,
        now() - (random()*30*86400 || ' seconds')::interval,
        CASE WHEN random() < 0.6 THEN now() - (random()*5*86400 || ' seconds')::interval ELSE NULL END
      );
    END LOOP;
  END LOOP;
END $$;
