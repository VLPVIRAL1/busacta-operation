-- Fix provision_project_lists trigger.
--
-- Problems with the original (20260606125057):
--   1. Fired on projects INSERT — SP is never configured at creation time,
--      so every new project spawned a dead job that burned 5 attempts.
--   2. No correlation_id — duplicate jobs could accumulate for the same project.
--
-- Fix:
--   1. Replace INSERT trigger with UPDATE trigger that fires only when
--      sharepoint_site_id transitions NULL → non-null (i.e. after the library
--      is provisioned and handleProvisionProjectLibrary sets the site ID).
--   2. Use ON CONFLICT (correlation_id) DO NOTHING so re-runs are idempotent.

DROP TRIGGER IF EXISTS trg_provision_project_lists ON projects;

CREATE OR REPLACE FUNCTION _enqueue_provision_project_lists()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    INSERT INTO sharepoint_sync_jobs
      (firm_id, job_type, payload, status, attempts, max_attempts, next_run_at, correlation_id)
    VALUES
      (NEW.firm_id,
       'provision_project_lists',
       jsonb_build_object('project_id', NEW.id),
       'queued', 0, 5, now(),
       'provision-lists:' || NEW.id::text)
    ON CONFLICT (correlation_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

-- NOTE: The UPDATE trigger with WHEN (OLD.sharepoint_site_id ...) is created
-- in 20260613000000_sharepoint_integration.sql after the column is added.
