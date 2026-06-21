CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user ON public.mfa_backup_codes(user_id);

ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own backup codes" ON public.mfa_backup_codes;
CREATE POLICY "Users read own backup codes" ON public.mfa_backup_codes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own backup codes" ON public.mfa_backup_codes;
CREATE POLICY "Users insert own backup codes" ON public.mfa_backup_codes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own backup codes" ON public.mfa_backup_codes;
CREATE POLICY "Users delete own backup codes" ON public.mfa_backup_codes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());