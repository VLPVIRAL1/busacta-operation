-- SharePoint real-time sync: Graph subscription tracking + per-project file stats RPC.

-- 1. Store Graph change-notification subscription metadata per project drive.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sharepoint_subscription_id          text,
  ADD COLUMN IF NOT EXISTS sharepoint_subscription_expires_at  timestamptz;

-- 2. Per-project file count helper used by the admin statistics card.
--    Returns one row per project with counts from both storage layers.
CREATE OR REPLACE FUNCTION get_project_file_stats(p_firm_id uuid DEFAULT NULL)
RETURNS TABLE (
  project_id            uuid,
  project_name          text,
  supabase_file_count   bigint,
  sharepoint_file_count bigint,
  sharepoint_drive_id   text
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    p.id,
    p.name,
    COUNT(DISTINCT ta.id)   AS supabase_file_count,
    COUNT(DISTINCT d.id)    AS sharepoint_file_count,
    p.sharepoint_drive_id
  FROM projects p
  LEFT JOIN tasks t             ON t.project_id = p.id
  LEFT JOIN task_attachments ta ON ta.task_id = t.id AND ta.archived_at IS NULL
  LEFT JOIN documents d         ON d.project_id = p.id
  WHERE (p_firm_id IS NULL OR p.firm_id = p_firm_id)
  GROUP BY p.id, p.name, p.sharepoint_drive_id
  ORDER BY p.name;
$$;
