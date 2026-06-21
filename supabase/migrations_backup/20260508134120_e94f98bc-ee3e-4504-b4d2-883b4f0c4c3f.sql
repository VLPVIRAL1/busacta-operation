CREATE TABLE public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_by_email text,
  migration_file text,
  category text NOT NULL DEFAULT 'manual',
  summary text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_audit_log_applied_at ON public.security_audit_log (applied_at DESC);
CREATE UNIQUE INDEX idx_security_audit_log_migration_file ON public.security_audit_log (migration_file) WHERE migration_file IS NOT NULL;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit log"
  ON public.security_audit_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Internal read audit log"
  ON public.security_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee'));

INSERT INTO public.security_audit_log (migration_file, category, summary, details, applied_at) VALUES
  ('20260508121122_d60c26e9-16e5-4298-a57d-706a51fb4b78.sql', 'rls', 'Initial RLS hardening pass', 'Tightened policies on task messages and admin routes.', now() - interval '1 hour'),
  ('20260508121707_7cda64ff-0aca-49b0-831d-0a05546e28f4.sql', 'rls', 'Time logs scoped to accessible tasks; mention infrastructure', 'time_logs INSERT/UPDATE policies now require user_can_access_firm() on the parent task.', now() - interval '50 minutes'),
  ('20260508122233_7bbe9d32-b987-436d-91fe-8ee7d812cfcf.sql', 'security_definer', 'Revoked EXECUTE on trigger-only SECURITY DEFINER functions', 'enforce_task_message_edit_policy, task_audit_trigger, task_message_audit_trigger, handle_new_user, enforce_single_open_timer, update_updated_at_column.', now() - interval '40 minutes'),
  ('20260508120840_1eaf73a4-227b-4fba-a8ff-5e4b8d02a0a7.sql', 'rls', 'Notifications inbox RLS', 'Each user reads/updates/deletes only their own notifications; internal team can insert.', now() - interval '30 minutes'),
  (NULL, 'realtime', 'Removed profiles table from Realtime publication', 'Profile rows (emails, session ids) are no longer broadcast to subscribers. Single-session enforcement now polls the user''s own row every 30s.', now() - interval '5 minutes'),
  (NULL, 'rls', 'Tightened task_messages author UPDATE policy', 'Authors can no longer flip is_client_visible to true on their own messages — only admins/employees can change visibility.', now() - interval '5 minutes');