-- Prevent a user from running two open timers simultaneously
CREATE OR REPLACE FUNCTION public.enforce_single_open_timer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ended_at IS NULL THEN
    -- Auto-close any other open timer for the same user
    UPDATE public.time_logs
       SET ended_at = NEW.started_at,
           duration_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NEW.started_at - started_at)) / 60)::int)
     WHERE user_id = NEW.user_id
       AND ended_at IS NULL
       AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_open_timer ON public.time_logs;
CREATE TRIGGER trg_enforce_single_open_timer
BEFORE INSERT OR UPDATE ON public.time_logs
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_open_timer();

-- Allow admins to manage workflow templates and checklist items (already covered),
-- and allow admins to delete user_roles (covered via Admins manage roles ALL policy).

-- Allow admins to insert profiles row for any user (used to bootstrap roles UI lookups)
-- Already exists via existing policies; no change.
