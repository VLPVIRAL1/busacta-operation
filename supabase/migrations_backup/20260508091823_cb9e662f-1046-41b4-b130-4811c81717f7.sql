-- Tighten broad branding storage object listing. Public bucket URLs still work by direct path.
DROP POLICY IF EXISTS "Branding public read" ON storage.objects;

-- Ensure task audit triggers are actually attached.
DROP TRIGGER IF EXISTS task_audit_on_tasks ON public.tasks;
CREATE TRIGGER task_audit_on_tasks
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.task_audit_trigger();

DROP TRIGGER IF EXISTS task_message_audit_on_visibility ON public.task_messages;
CREATE TRIGGER task_message_audit_on_visibility
AFTER UPDATE ON public.task_messages
FOR EACH ROW EXECUTE FUNCTION public.task_message_audit_trigger();

-- Support custom workflow templates while preserving existing enum-based system templates.
ALTER TABLE public.workflow_templates
  ALTER COLUMN template DROP NOT NULL;

ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.workflow_templates
SET
  slug = COALESCE(slug, template::text),
  is_system = true,
  updated_at = now()
WHERE template IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_templates_slug_unique'
      AND conrelid = 'public.workflow_templates'::regclass
  ) THEN
    ALTER TABLE public.workflow_templates
      ADD CONSTRAINT workflow_templates_slug_unique UNIQUE (slug);
  END IF;
END $$;

ALTER TABLE public.template_checklist_items
  ALTER COLUMN template DROP NOT NULL;

ALTER TABLE public.template_checklist_items
  ADD COLUMN IF NOT EXISTS workflow_template_id uuid REFERENCES public.workflow_templates(id) ON DELETE CASCADE;

UPDATE public.template_checklist_items i
SET workflow_template_id = wt.id
FROM public.workflow_templates wt
WHERE i.workflow_template_id IS NULL
  AND i.template IS NOT NULL
  AND wt.template = i.template;

ALTER TABLE public.template_checklist_items
  ALTER COLUMN workflow_template_id SET NOT NULL;

-- Admins can manage templates; authenticated users can read them. Make policy grants explicit.
DROP POLICY IF EXISTS "Auth read templates" ON public.workflow_templates;
DROP POLICY IF EXISTS "Admins manage templates" ON public.workflow_templates;
CREATE POLICY "Authenticated users can read templates"
ON public.workflow_templates
FOR SELECT TO authenticated
USING (true);
CREATE POLICY "Admins can manage templates"
ON public.workflow_templates
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Auth read checklist" ON public.template_checklist_items;
DROP POLICY IF EXISTS "Admins manage checklist" ON public.template_checklist_items;
CREATE POLICY "Authenticated users can read checklist items"
ON public.template_checklist_items
FOR SELECT TO authenticated
USING (true);
CREATE POLICY "Admins can manage checklist items"
ON public.template_checklist_items
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Restrict direct API execution of SECURITY DEFINER functions. They remain usable inside RLS/triggers.
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_can_access_firm(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.task_audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.task_message_audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lookup_invitation(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lookup_invitation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO service_role;