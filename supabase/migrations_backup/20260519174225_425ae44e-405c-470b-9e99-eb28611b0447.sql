-- ============================================================
-- EMAIL HUB — Phase 0 foundation
-- ============================================================

-- 1. connected_email_accounts -------------------------------------------------
CREATE TABLE public.connected_email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('microsoft','google')),
  email_address text NOT NULL,
  display_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  sync_status text NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle','syncing','error','paused')),
  sync_error text,
  last_synced_at timestamptz,
  delta_token text,
  webhook_subscription_id text,
  webhook_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_address)
);
CREATE INDEX idx_cea_user ON public.connected_email_accounts(user_id);
CREATE INDEX idx_cea_webhook_sub ON public.connected_email_accounts(webhook_subscription_id);

-- 2. tracked_email_threads ----------------------------------------------------
CREATE TABLE public.tracked_email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.connected_email_accounts(id) ON DELETE CASCADE,
  provider_thread_id text NOT NULL,
  subject text,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_message_at timestamptz,
  message_count int NOT NULL DEFAULT 0,
  has_attachments boolean NOT NULL DEFAULT false,
  unread_count int NOT NULL DEFAULT 0,
  is_flagged boolean NOT NULL DEFAULT false,
  folder text NOT NULL DEFAULT 'inbox',
  snippet text,
  linked_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, provider_thread_id)
);
CREATE INDEX idx_tet_account_folder_time
  ON public.tracked_email_threads(account_id, folder, last_message_at DESC);

-- 3. tracked_emails -----------------------------------------------------------
CREATE TABLE public.tracked_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.tracked_email_threads(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.connected_email_accounts(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  from_address text,
  from_name text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  body_html text,
  body_text text,
  sent_at timestamptz,
  is_read boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  has_attachments boolean NOT NULL DEFAULT false,
  in_reply_to text,
  raw_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, provider_message_id)
);
CREATE INDEX idx_te_thread ON public.tracked_emails(thread_id, sent_at DESC);

-- 4. tracked_email_attachments -----------------------------------------------
CREATE TABLE public.tracked_email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES public.tracked_emails(id) ON DELETE CASCADE,
  provider_attachment_id text NOT NULL,
  filename text,
  mime_type text,
  size_bytes bigint,
  inline_cid text,
  saved_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tea_email ON public.tracked_email_attachments(email_id);

-- 5. email_context_links ------------------------------------------------------
CREATE TABLE public.email_context_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.tracked_email_threads(id) ON DELETE CASCADE,
  link_type text NOT NULL CHECK (link_type IN ('task','project','firm')),
  task_id uuid,
  project_id uuid,
  firm_id uuid,
  linked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce exactly-one-target via trigger (per memory rule: avoid CHECK with mutable semantics)
CREATE OR REPLACE FUNCTION public.email_context_links_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    (CASE WHEN NEW.task_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN NEW.project_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN NEW.firm_id IS NULL THEN 0 ELSE 1 END)
  ) <> 1 THEN
    RAISE EXCEPTION 'email_context_links must reference exactly one of task_id/project_id/firm_id';
  END IF;
  IF NEW.link_type = 'task'    AND NEW.task_id    IS NULL THEN RAISE EXCEPTION 'task link missing task_id'; END IF;
  IF NEW.link_type = 'project' AND NEW.project_id IS NULL THEN RAISE EXCEPTION 'project link missing project_id'; END IF;
  IF NEW.link_type = 'firm'    AND NEW.firm_id    IS NULL THEN RAISE EXCEPTION 'firm link missing firm_id'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_ecl_validate
  BEFORE INSERT OR UPDATE ON public.email_context_links
  FOR EACH ROW EXECUTE FUNCTION public.email_context_links_validate();

CREATE UNIQUE INDEX uniq_ecl_thread_target ON public.email_context_links (
  thread_id, link_type, COALESCE(task_id, project_id, firm_id)
);
CREATE INDEX idx_ecl_thread ON public.email_context_links(thread_id);
CREATE INDEX idx_ecl_task ON public.email_context_links(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_ecl_project ON public.email_context_links(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_ecl_firm ON public.email_context_links(firm_id) WHERE firm_id IS NOT NULL;

-- Maintain denormalized linked_count
CREATE OR REPLACE FUNCTION public.email_context_links_recount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.tracked_email_threads SET linked_count = linked_count + 1 WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.tracked_email_threads SET linked_count = GREATEST(linked_count - 1, 0) WHERE id = OLD.thread_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_ecl_recount
  AFTER INSERT OR DELETE ON public.email_context_links
  FOR EACH ROW EXECUTE FUNCTION public.email_context_links_recount();

-- 6. email_send_outbox --------------------------------------------------------
CREATE TABLE public.email_send_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.connected_email_accounts(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX idx_eso_status ON public.email_send_outbox(status, created_at);

-- 7. email_sync_jobs ----------------------------------------------------------
CREATE TABLE public.email_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.connected_email_accounts(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'incremental',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX idx_esj_pending ON public.email_sync_jobs(status, created_at);

-- ============================================================
-- updated_at triggers (reuse existing helper if present)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $f$;
  END IF;
END$$;

CREATE TRIGGER trg_cea_updated BEFORE UPDATE ON public.connected_email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tet_updated BEFORE UPDATE ON public.tracked_email_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Security-definer helper: user_can_view_thread
-- A user can view a thread if they own the mailbox OR a context link
-- points to a task/project/firm they can already access via existing helpers.
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_can_view_thread(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_has_link boolean;
BEGIN
  SELECT cea.user_id INTO v_owner
  FROM public.tracked_email_threads t
  JOIN public.connected_email_accounts cea ON cea.id = t.account_id
  WHERE t.id = _thread_id;

  IF v_owner IS NULL THEN
    RETURN false;
  END IF;
  IF v_owner = _user_id THEN
    RETURN true;
  END IF;

  -- Shared visibility: any link row whose target the user can access.
  -- We err on the safe side: return false unless an access helper exists.
  SELECT EXISTS (
    SELECT 1
    FROM public.email_context_links ecl
    WHERE ecl.thread_id = _thread_id
      AND (
        (ecl.task_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.tasks tk WHERE tk.id = ecl.task_id AND tk.assigned_to = _user_id
        ))
        OR
        (ecl.project_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = ecl.project_id
        ))
        OR
        (ecl.firm_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.firms f WHERE f.id = ecl.firm_id
        ))
      )
  ) INTO v_has_link;

  RETURN COALESCE(v_has_link, false);
END;
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.connected_email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_email_threads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_emails            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_context_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_outbox         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sync_jobs           ENABLE ROW LEVEL SECURITY;

-- connected_email_accounts: owner only
CREATE POLICY cea_select_owner ON public.connected_email_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY cea_insert_owner ON public.connected_email_accounts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY cea_update_owner ON public.connected_email_accounts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY cea_delete_owner ON public.connected_email_accounts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- tracked_email_threads: owner OR can-view-via-link
CREATE POLICY tet_select ON public.tracked_email_threads
  FOR SELECT TO authenticated
  USING (public.user_can_view_thread(id, auth.uid()));
CREATE POLICY tet_write_owner ON public.tracked_email_threads
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.connected_email_accounts cea
                 WHERE cea.id = account_id AND cea.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.connected_email_accounts cea
                      WHERE cea.id = account_id AND cea.user_id = auth.uid()));

-- tracked_emails: same visibility model via thread
CREATE POLICY te_select ON public.tracked_emails
  FOR SELECT TO authenticated
  USING (public.user_can_view_thread(thread_id, auth.uid()));
CREATE POLICY te_write_owner ON public.tracked_emails
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.connected_email_accounts cea
                 WHERE cea.id = account_id AND cea.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.connected_email_accounts cea
                      WHERE cea.id = account_id AND cea.user_id = auth.uid()));

-- tracked_email_attachments: inherit via email -> thread
CREATE POLICY tea_select ON public.tracked_email_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tracked_emails e
    WHERE e.id = email_id AND public.user_can_view_thread(e.thread_id, auth.uid())
  ));
CREATE POLICY tea_write_owner ON public.tracked_email_attachments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tracked_emails e
    JOIN public.connected_email_accounts cea ON cea.id = e.account_id
    WHERE e.id = email_id AND cea.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tracked_emails e
    JOIN public.connected_email_accounts cea ON cea.id = e.account_id
    WHERE e.id = email_id AND cea.user_id = auth.uid()
  ));

-- email_context_links: read if you can view the thread; write if you can view AND linked_by = you (or you own the mailbox)
CREATE POLICY ecl_select ON public.email_context_links
  FOR SELECT TO authenticated
  USING (public.user_can_view_thread(thread_id, auth.uid()));
CREATE POLICY ecl_insert ON public.email_context_links
  FOR INSERT TO authenticated
  WITH CHECK (linked_by = auth.uid() AND public.user_can_view_thread(thread_id, auth.uid()));
CREATE POLICY ecl_delete ON public.email_context_links
  FOR DELETE TO authenticated
  USING (linked_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.tracked_email_threads t
    JOIN public.connected_email_accounts cea ON cea.id = t.account_id
    WHERE t.id = thread_id AND cea.user_id = auth.uid()
  ));

-- email_send_outbox: owner only
CREATE POLICY eso_owner ON public.email_send_outbox
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.connected_email_accounts cea
                 WHERE cea.id = account_id AND cea.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.connected_email_accounts cea
                      WHERE cea.id = account_id AND cea.user_id = auth.uid()));

-- email_sync_jobs: owner only
CREATE POLICY esj_owner ON public.email_sync_jobs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.connected_email_accounts cea
                 WHERE cea.id = account_id AND cea.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.connected_email_accounts cea
                      WHERE cea.id = account_id AND cea.user_id = auth.uid()));
