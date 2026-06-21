-- 3-device cap: each browser/install is one device slot.
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  label text,
  user_agent text,
  last_ip inet,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text,
  UNIQUE (user_id, device_id)
);

CREATE INDEX idx_user_devices_active
  ON public.user_devices (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- Users manage only their own device records. Admins do not get a blanket
-- read policy here — device fingerprints are personal data; if support needs
-- visibility we can add a server function later.
CREATE POLICY "Users read own devices"
  ON public.user_devices FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own devices"
  ON public.user_devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own devices"
  ON public.user_devices FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own devices"
  ON public.user_devices FOR DELETE
  USING (user_id = auth.uid());

-- Atomic helper: claim a slot for (user, device). Returns one of:
--   { status:'ok', device_id:<uuid> }
--   { status:'reactivated', device_id:<uuid> }   (existing row un-revoked, no new slot consumed)
--   { status:'limit_reached', active:[{device_id,label,user_agent,last_seen_at}, ...] }
CREATE OR REPLACE FUNCTION public.claim_device_slot(
  _device_id text,
  _label text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _ip inet DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing public.user_devices;
  _active_count int;
  _active jsonb;
  _row_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _device_id IS NULL OR length(_device_id) < 8 THEN
    RAISE EXCEPTION 'invalid_device_id';
  END IF;

  SELECT * INTO _existing
    FROM public.user_devices
   WHERE user_id = _uid AND device_id = _device_id
   FOR UPDATE;

  -- Existing active device → just heartbeat.
  IF _existing.id IS NOT NULL AND _existing.revoked_at IS NULL THEN
    UPDATE public.user_devices
       SET last_seen_at = now(),
           user_agent = COALESCE(_user_agent, user_agent),
           label = COALESCE(_label, label),
           last_ip = COALESCE(_ip, last_ip)
     WHERE id = _existing.id;
    RETURN jsonb_build_object('status','ok','device_id', _existing.id);
  END IF;

  -- Either no row yet, or it was previously revoked. Count current active
  -- devices to decide whether we can claim a slot.
  SELECT count(*) INTO _active_count
    FROM public.user_devices
   WHERE user_id = _uid AND revoked_at IS NULL;

  IF _active_count >= 3 THEN
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'device_id', device_id,
               'label', label,
               'user_agent', user_agent,
               'last_seen_at', last_seen_at,
               'last_ip', host(last_ip)
             ) ORDER BY last_seen_at DESC
           ), '[]'::jsonb)
      INTO _active
      FROM public.user_devices
     WHERE user_id = _uid AND revoked_at IS NULL;
    RETURN jsonb_build_object('status','limit_reached','active', _active);
  END IF;

  IF _existing.id IS NOT NULL THEN
    -- Re-activate prior row.
    UPDATE public.user_devices
       SET revoked_at = NULL,
           revoked_reason = NULL,
           last_seen_at = now(),
           user_agent = COALESCE(_user_agent, user_agent),
           label = COALESCE(_label, label),
           last_ip = COALESCE(_ip, last_ip)
     WHERE id = _existing.id
     RETURNING id INTO _row_id;
    RETURN jsonb_build_object('status','reactivated','device_id', _row_id);
  END IF;

  INSERT INTO public.user_devices(user_id, device_id, label, user_agent, last_ip)
  VALUES (_uid, _device_id, _label, _user_agent, _ip)
  RETURNING id INTO _row_id;
  RETURN jsonb_build_object('status','ok','device_id', _row_id);
END $$;

-- Revoke one device + claim the current one atomically. Use this when the
-- user picks which existing device to sign out so they can finish signing in
-- on the new one.
CREATE OR REPLACE FUNCTION public.revoke_and_claim_device(
  _revoke_device_id text,
  _claim_device_id text,
  _label text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _ip inet DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.user_devices
     SET revoked_at = now(), revoked_reason = 'user_swapped_device'
   WHERE user_id = _uid AND device_id = _revoke_device_id AND revoked_at IS NULL;
  RETURN public.claim_device_slot(_claim_device_id, _label, _user_agent, _ip);
END $$;

-- Lightweight liveness check for the current device. Returns active=false if
-- this device has been revoked elsewhere, so the client can sign out cleanly.
CREATE OR REPLACE FUNCTION public.heartbeat_device(_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.user_devices;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _row FROM public.user_devices
   WHERE user_id = _uid AND device_id = _device_id;
  IF _row.id IS NULL OR _row.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('active', false);
  END IF;
  UPDATE public.user_devices SET last_seen_at = now() WHERE id = _row.id;
  RETURN jsonb_build_object('active', true);
END $$;

GRANT EXECUTE ON FUNCTION public.claim_device_slot(text, text, text, inet) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_and_claim_device(text, text, text, text, inet) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_device(text) TO authenticated;