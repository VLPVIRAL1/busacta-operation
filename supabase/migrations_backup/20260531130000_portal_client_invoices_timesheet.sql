-- Portal client read access for Invoices + an aggregate-only Timesheet summary.
--
-- Context: the client portal already exposes SOPs, pipeline stages, task audit,
-- documents, tasks and messages via existing RLS. Invoices and time logs were
-- finance/internal-only. This migration:
--   1. Grants clients SELECT on issued invoices (and their line items + payments)
--      for firms they can access, never draft/void.
--   2. Exposes billable time to clients as an AGGREGATE summary only (per
--      project/task), via a SECURITY DEFINER function — so we never leak per-entry
--      notes, who logged it, or when. No raw row policy is added to time_logs.
--
-- `user_can_access_firm()` already resolves the caller via auth.uid()
-- (super_admin/admin/employee OR primary partner OR the client's own firm), so it
-- is safe to call from a SECURITY DEFINER function.

-- ── Invoices ────────────────────────────────────────────────────────────────
CREATE POLICY "Clients read issued invoices"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    status IN ('sent', 'partial', 'paid')
    AND public.user_can_access_firm(firm_id)
  );

CREATE POLICY "Clients read issued invoice line items"
  ON public.invoice_line_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND i.status IN ('sent', 'partial', 'paid')
        AND public.user_can_access_firm(i.firm_id)
    )
  );

CREATE POLICY "Clients read issued invoice payments"
  ON public.invoice_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_payments.invoice_id
        AND i.status IN ('sent', 'partial', 'paid')
        AND public.user_can_access_firm(i.firm_id)
    )
  );

-- ── Timesheet (aggregate-only) ──────────────────────────────────────────────
-- Returns billable minutes rolled up per task/project for firms the caller can
-- access. SECURITY DEFINER + user_can_access_firm() keeps it scoped to the
-- caller while hiding raw rows (notes / user_id / timestamps stay internal).
CREATE OR REPLACE FUNCTION public.portal_billable_time_summary()
RETURNS TABLE (
  project_id uuid,
  project_name text,
  project_code text,
  task_id uuid,
  task_title text,
  total_minutes bigint,
  entry_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.code,
    t.id,
    t.title,
    SUM(COALESCE(tl.effective_minutes, tl.duration_minutes, 0))::bigint AS total_minutes,
    COUNT(*)::bigint AS entry_count
  FROM public.time_logs tl
  JOIN public.tasks t ON t.id = tl.task_id
  JOIN public.client_entities ce ON ce.id = t.entity_id
  JOIN public.projects p ON p.id = ce.project_id
  WHERE tl.billable = true
    AND public.user_can_access_firm(p.firm_id)
  GROUP BY p.id, p.name, p.code, t.id, t.title;
$$;

GRANT EXECUTE ON FUNCTION public.portal_billable_time_summary() TO authenticated;
