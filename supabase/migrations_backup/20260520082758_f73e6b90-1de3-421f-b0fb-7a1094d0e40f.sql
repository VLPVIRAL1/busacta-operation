CREATE OR REPLACE FUNCTION public.enforce_subrole_capability_ceiling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_role public.app_role;
  parent_allowed boolean;
BEGIN
  IF NEW.allowed IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  SELECT base_role INTO parent_role
  FROM public.role_subroles
  WHERE id = NEW.subrole_id;

  IF parent_role IS NULL THEN
    RAISE EXCEPTION 'Sub-role % not found', NEW.subrole_id;
  END IF;

  -- Admin and super_admin parents implicitly grant everything.
  IF parent_role IN ('admin', 'super_admin') THEN
    RETURN NEW;
  END IF;

  SELECT allowed INTO parent_allowed
  FROM public.role_capabilities
  WHERE role = parent_role AND capability = NEW.module_key;

  IF COALESCE(parent_allowed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Sub-role capability % cannot exceed parent role % (capability not granted to parent)',
      NEW.module_key, parent_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_subrole_capability_ceiling ON public.role_subrole_capabilities;
CREATE TRIGGER trg_enforce_subrole_capability_ceiling
BEFORE INSERT OR UPDATE ON public.role_subrole_capabilities
FOR EACH ROW
EXECUTE FUNCTION public.enforce_subrole_capability_ceiling();