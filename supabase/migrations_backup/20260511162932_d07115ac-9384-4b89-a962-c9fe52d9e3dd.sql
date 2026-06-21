CREATE INDEX IF NOT EXISTS idx_firms_status_created_at
  ON public.firms (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_firms_lower_name
  ON public.firms (lower(name));

CREATE INDEX IF NOT EXISTS idx_firms_primary_partner
  ON public.firms (primary_partner_user_id)
  WHERE primary_partner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_firm_contacts_firm_created_at
  ON public.firm_contacts (firm_id, created_at);

CREATE INDEX IF NOT EXISTS idx_firm_internal_team_user
  ON public.firm_internal_team (user_id);

CREATE INDEX IF NOT EXISTS idx_firm_capabilities_user
  ON public.firm_member_capabilities (user_id, firm_id);

CREATE INDEX IF NOT EXISTS idx_projects_firm_created_at
  ON public.projects (firm_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_custom_field_defs_project_sort
  ON public.project_custom_field_defs (project_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_client_entities_project
  ON public.client_entities (project_id);

CREATE INDEX IF NOT EXISTS idx_tasks_entity
  ON public.tasks (entity_id);

CREATE INDEX IF NOT EXISTS idx_tasks_pipeline_stage
  ON public.tasks (pipeline_stage_id)
  WHERE pipeline_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_firm
  ON public.profiles (firm_id)
  WHERE firm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_full_name
  ON public.profiles (full_name);