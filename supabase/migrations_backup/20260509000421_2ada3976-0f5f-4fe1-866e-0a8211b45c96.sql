
DO $$ BEGIN
  CREATE TYPE public.ticket_category AS ENUM ('it_support','facilities','hr','suggestion','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_priority AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_status AS ENUM ('open','in_progress','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.internal_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category public.ticket_category NOT NULL DEFAULT 'other',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  status public.ticket_status NOT NULL DEFAULT 'open',
  requester_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_tickets_status_idx ON public.internal_tickets (status);
CREATE INDEX IF NOT EXISTS internal_tickets_requester_idx ON public.internal_tickets (requester_id);
CREATE INDEX IF NOT EXISTS internal_tickets_assignee_idx ON public.internal_tickets (assignee_id);

ALTER TABLE public.internal_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tickets - view own or admin" ON public.internal_tickets;
CREATE POLICY "Tickets - view own or admin" ON public.internal_tickets
  FOR SELECT USING (
    requester_id = auth.uid()
    OR assignee_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'hr_manager')
  );

DROP POLICY IF EXISTS "Tickets - any user create" ON public.internal_tickets;
CREATE POLICY "Tickets - any user create" ON public.internal_tickets
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND requester_id = auth.uid()
  );

DROP POLICY IF EXISTS "Tickets - update by owner or admin" ON public.internal_tickets;
CREATE POLICY "Tickets - update by owner or admin" ON public.internal_tickets
  FOR UPDATE USING (
    requester_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'hr_manager')
  );

DROP POLICY IF EXISTS "Tickets - delete admin only" ON public.internal_tickets;
CREATE POLICY "Tickets - delete admin only" ON public.internal_tickets
  FOR DELETE USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
  );

DROP TRIGGER IF EXISTS trg_internal_tickets_updated_at ON public.internal_tickets;
CREATE TRIGGER trg_internal_tickets_updated_at
  BEFORE UPDATE ON public.internal_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.internal_ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.internal_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_ticket_comments_ticket_idx ON public.internal_ticket_comments (ticket_id, created_at);

ALTER TABLE public.internal_ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ticket comments - read if can see ticket" ON public.internal_ticket_comments;
CREATE POLICY "Ticket comments - read if can see ticket" ON public.internal_ticket_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.internal_tickets t
      WHERE t.id = ticket_id
        AND (
          t.requester_id = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.has_role(auth.uid(),'admin')
          OR public.has_role(auth.uid(),'super_admin')
          OR public.has_role(auth.uid(),'hr_manager')
        )
    )
  );

DROP POLICY IF EXISTS "Ticket comments - author insert" ON public.internal_ticket_comments;
CREATE POLICY "Ticket comments - author insert" ON public.internal_ticket_comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.internal_tickets t
      WHERE t.id = ticket_id
        AND (
          t.requester_id = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.has_role(auth.uid(),'admin')
          OR public.has_role(auth.uid(),'super_admin')
          OR public.has_role(auth.uid(),'hr_manager')
        )
    )
  );

DROP POLICY IF EXISTS "Ticket comments - author update" ON public.internal_ticket_comments;
CREATE POLICY "Ticket comments - author update" ON public.internal_ticket_comments
  FOR UPDATE USING (author_id = auth.uid());

DROP POLICY IF EXISTS "Ticket comments - author or admin delete" ON public.internal_ticket_comments;
CREATE POLICY "Ticket comments - author or admin delete" ON public.internal_ticket_comments
  FOR DELETE USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
  );
