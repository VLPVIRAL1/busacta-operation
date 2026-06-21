-- 1. Per-user hub permission overrides
CREATE TABLE IF NOT EXISTS public.user_hub_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (user_id, module_key)
);

ALTER TABLE public.user_hub_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage hub perms" ON public.user_hub_permissions;
CREATE POLICY "Admins manage hub perms"
ON public.user_hub_permissions
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Users read own hub perms" ON public.user_hub_permissions;
CREATE POLICY "Users read own hub perms"
ON public.user_hub_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2. Allow unified 'transfer' on petty cash transactions (paired in/out leg)
ALTER TABLE public.petty_cash_transactions
  DROP CONSTRAINT IF EXISTS petty_cash_transactions_kind_check;

ALTER TABLE public.petty_cash_transactions
  ADD CONSTRAINT petty_cash_transactions_kind_check
  CHECK (kind = ANY (ARRAY['transfer'::text, 'transfer_in'::text, 'transfer_out'::text, 'expense'::text]));
