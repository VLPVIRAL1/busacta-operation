
-- 1. Column
ALTER TABLE public.petty_cash_reconciliations
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Default new rows to created_by when assignee not provided
CREATE OR REPLACE FUNCTION public.pcr_default_assignee()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    NEW.assigned_to := NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pcr_default_assignee_trg ON public.petty_cash_reconciliations;
CREATE TRIGGER pcr_default_assignee_trg
  BEFORE INSERT ON public.petty_cash_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.pcr_default_assignee();

-- Backfill
UPDATE public.petty_cash_reconciliations
SET assigned_to = created_by
WHERE assigned_to IS NULL AND created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pcr_assignee
  ON public.petty_cash_reconciliations(assigned_to);

-- 2. Replace blanket policy with role+ownership-aware ones
DROP POLICY IF EXISTS "Finance manage petty_cash_reconciliations" ON public.petty_cash_reconciliations;

-- SELECT: finance/admin or owner/assignee
CREATE POLICY "pcr_select"
ON public.petty_cash_reconciliations
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'finance_manager'::app_role)
  OR created_by = auth.uid()
  OR assigned_to = auth.uid()
);

-- INSERT: any finance-capable role can create their own
CREATE POLICY "pcr_insert"
ON public.petty_cash_reconciliations
FOR INSERT TO authenticated
WITH CHECK (
  (created_by = auth.uid() OR created_by IS NULL)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'employee'::app_role)
  )
);

-- UPDATE: drafts → admin/super_admin/finance_manager OR owner/assignee.
--         non-drafts → admin/super_admin/finance_manager only.
CREATE POLICY "pcr_update"
ON public.petty_cash_reconciliations
FOR UPDATE TO authenticated
USING (
  CASE
    WHEN status = 'draft' THEN (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'finance_manager'::app_role)
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
    )
    ELSE (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'finance_manager'::app_role)
    )
  END
)
WITH CHECK (
  CASE
    WHEN status = 'draft' THEN (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'finance_manager'::app_role)
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
    )
    ELSE (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'finance_manager'::app_role)
    )
  END
);

-- DELETE: only admin/super_admin OR owner of a still-draft row
CREATE POLICY "pcr_delete"
ON public.petty_cash_reconciliations
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR (status = 'draft' AND (created_by = auth.uid() OR assigned_to = auth.uid()))
);
