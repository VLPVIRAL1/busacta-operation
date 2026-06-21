-- Add last_chosen_at to track which session the user previously selected on the Multi Login screen
ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS last_chosen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_devices_last_chosen
  ON public.user_devices (user_id, last_chosen_at DESC NULLS LAST)
  WHERE revoked_at IS NULL;

-- Mark a device as the user's last-chosen session
CREATE OR REPLACE FUNCTION public.mark_device_chosen(_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.user_devices
     SET last_chosen_at = now(),
         last_seen_at  = now()
   WHERE user_id   = auth.uid()
     AND device_id = _device_id
     AND revoked_at IS NULL;
END;
$$;

-- Revoke every other active device for the current user, keeping only _keep_device_id
CREATE OR REPLACE FUNCTION public.revoke_other_devices(_keep_device_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.user_devices
     SET revoked_at     = now(),
         revoked_reason = 'user_revoked_from_multi_login'
   WHERE user_id    = auth.uid()
     AND device_id <> _keep_device_id
     AND revoked_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_device_chosen(text)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_other_devices(text)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_device_chosen(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_other_devices(text)  TO authenticated;