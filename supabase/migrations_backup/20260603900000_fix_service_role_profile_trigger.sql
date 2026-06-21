-- Fix: enforce_profile_self_update trigger blocked service-role connections
-- because auth.uid() is NULL when using the service-role key. Server functions
-- (bulk import, employee create/update) already perform their own auth checks,
-- so service-role writes must be trusted unconditionally.
--
-- Also ensure super_admin is explicitly above admin in the bypass hierarchy
-- (belt-and-suspenders for future trigger changes).

CREATE OR REPLACE FUNCTION public.enforce_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role connections (server functions) have auth.uid() = NULL.
  -- These are already authorized at the application layer — allow all writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Authenticated admin / super_admin callers may change any profile field.
  IF public.has_role(auth.uid(), 'super_admin'::app_role)
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- All other authenticated users: block changes to privileged profile fields.
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
