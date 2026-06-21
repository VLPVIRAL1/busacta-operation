
-- 1. Compensation table
CREATE TABLE public.staff_compensation (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  hourly_rate numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.staff_compensation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and finance manage compensation"
  ON public.staff_compensation
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'finance_manager'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'finance_manager'::app_role)
  );

CREATE POLICY "Users read own compensation"
  ON public.staff_compensation
  FOR SELECT
  USING (user_id = auth.uid());

CREATE TRIGGER trg_staff_compensation_updated
  BEFORE UPDATE ON public.staff_compensation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Backfill from existing profiles.hourly_rate
INSERT INTO public.staff_compensation (user_id, hourly_rate)
SELECT id, COALESCE(hourly_rate, 0)
FROM public.profiles
WHERE hourly_rate IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- 3. Drop sensitive column from profiles
ALTER TABLE public.profiles DROP COLUMN hourly_rate;

-- 4. Trigger: prevent self-elevation through profile update
CREATE OR REPLACE FUNCTION public.enforce_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.position IS DISTINCT FROM OLD.position
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.firm_id IS DISTINCT FROM OLD.firm_id THEN
    RAISE EXCEPTION 'Only an administrator can change privileged profile fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_self_update ON public.profiles;
CREATE TRIGGER enforce_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_self_update();

-- 5. Tighten task_messages UPDATE policy so non-staff authors cannot toggle
--    open-point / pin / status flags on their own messages within 30 minutes.
DROP POLICY IF EXISTS "Authors update own messages within 30 min" ON public.task_messages;
CREATE POLICY "Authors update own messages within 30 min"
  ON public.task_messages
  FOR UPDATE
  USING (
    (author_id = auth.uid())
    AND (created_at > (now() - INTERVAL '30 minutes'))
  )
  WITH CHECK (
    (author_id = auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'employee'::app_role)
      OR (
        (is_client_visible = true)
        AND (COALESCE(is_open_point, false) = false)
        AND (COALESCE(is_pinned, false) = false)
        AND (open_point_status IS NULL)
        AND (open_point_assignee_id IS NULL)
        AND (open_point_done_at IS NULL)
        AND (open_point_done_by IS NULL)
        AND (resolved_at IS NULL)
        AND (resolved_by IS NULL)
      )
    )
  );

-- 6. Restrict office_keys SELECT to staff
DROP POLICY IF EXISTS "Authenticated read keys" ON public.office_keys;
CREATE POLICY "Staff read office keys"
  ON public.office_keys
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
  );
