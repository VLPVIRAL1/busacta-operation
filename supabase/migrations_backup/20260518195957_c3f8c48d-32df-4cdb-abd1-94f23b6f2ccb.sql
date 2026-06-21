CREATE TABLE public.petty_cash_recon_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid NOT NULL REFERENCES public.petty_cash_reconciliations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pc_recon_audit_recon ON public.petty_cash_recon_audit(reconciliation_id, created_at DESC);

ALTER TABLE public.petty_cash_recon_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recon_audit_select"
ON public.petty_cash_recon_audit
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'finance_manager'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.petty_cash_reconciliations r
    WHERE r.id = petty_cash_recon_audit.reconciliation_id
      AND r.created_by = auth.uid()
  )
);

CREATE POLICY "recon_audit_insert"
ON public.petty_cash_recon_audit
FOR INSERT
TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.petty_cash_reconciliations r
      WHERE r.id = petty_cash_recon_audit.reconciliation_id
        AND r.created_by = auth.uid()
    )
  )
);