-- Allow super_admin to manage template_checklist_items.
-- The "Admins can manage checklist items" policy only checked the 'admin' role,
-- so super_admin users hit "new row violates row-level security policy" when
-- adding clarification items. Align with workflow_templates which permits both.

DROP POLICY IF EXISTS "Admins can manage checklist items" ON public.template_checklist_items;

CREATE POLICY "Admins can manage checklist items"
  ON public.template_checklist_items
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );
