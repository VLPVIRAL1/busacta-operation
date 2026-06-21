
-- Global Workspace Dashboard tables

-- 1) personal_reminders
CREATE TABLE public.personal_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  body text NOT NULL,
  remind_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_personal_reminders_user ON public.personal_reminders(user_id, completed_at, remind_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_reminders TO authenticated;
GRANT ALL ON public.personal_reminders TO service_role;

ALTER TABLE public.personal_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reminders_owner_select" ON public.personal_reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "reminders_owner_insert" ON public.personal_reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reminders_owner_update" ON public.personal_reminders FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "reminders_owner_delete" ON public.personal_reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER personal_reminders_updated_at BEFORE UPDATE ON public.personal_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) daily_notes
CREATE TABLE public.daily_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  note_date date NOT NULL DEFAULT current_date,
  title text NOT NULL DEFAULT 'Untitled note',
  content_json jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_daily_notes_owner_date ON public.daily_notes(owner_id, note_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_notes TO authenticated;
GRANT ALL ON public.daily_notes TO service_role;

ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;

-- 3) daily_note_shares
CREATE TABLE public.daily_note_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id uuid NOT NULL REFERENCES public.daily_notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  permission text NOT NULL CHECK (permission IN ('view','edit')),
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(note_id, user_id)
);
CREATE INDEX idx_daily_note_shares_user ON public.daily_note_shares(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_note_shares TO authenticated;
GRANT ALL ON public.daily_note_shares TO service_role;

ALTER TABLE public.daily_note_shares ENABLE ROW LEVEL SECURITY;

-- daily_notes policies (now that shares exists)
CREATE POLICY "notes_owner_all" ON public.daily_notes FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "notes_shared_select" ON public.daily_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_note_shares s WHERE s.note_id = daily_notes.id AND s.user_id = auth.uid()));
CREATE POLICY "notes_shared_edit_update" ON public.daily_notes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_note_shares s WHERE s.note_id = daily_notes.id AND s.user_id = auth.uid() AND s.permission = 'edit'));

CREATE TRIGGER daily_notes_updated_at BEFORE UPDATE ON public.daily_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- shares policies
CREATE POLICY "shares_owner_manage" ON public.daily_note_shares FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_notes n WHERE n.id = daily_note_shares.note_id AND n.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.daily_notes n WHERE n.id = daily_note_shares.note_id AND n.owner_id = auth.uid()));
CREATE POLICY "shares_user_see_own" ON public.daily_note_shares FOR SELECT TO authenticated
  USING (auth.uid() = user_id);


-- 4) my_day_flags
CREATE TABLE public.my_day_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  flagged_for date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, task_id, flagged_for)
);
CREATE INDEX idx_my_day_flags_user_date ON public.my_day_flags(user_id, flagged_for);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_day_flags TO authenticated;
GRANT ALL ON public.my_day_flags TO service_role;

ALTER TABLE public.my_day_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "myday_owner_all" ON public.my_day_flags FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- 5) task_user_order
CREATE TABLE public.task_user_order (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, task_id)
);
CREATE INDEX idx_task_user_order_user ON public.task_user_order(user_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_user_order TO authenticated;
GRANT ALL ON public.task_user_order TO service_role;

ALTER TABLE public.task_user_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_order_owner_all" ON public.task_user_order FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.personal_reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_note_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE public.my_day_flags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_user_order;
