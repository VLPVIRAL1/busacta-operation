
CREATE OR REPLACE FUNCTION public.validate_esign_target_xor()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.target_kind IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.target_kind = 'direct_client' THEN
    IF NEW.target_direct_client_id IS NULL THEN
      RAISE EXCEPTION 'target_direct_client_id required when target_kind=direct_client';
    END IF;
    IF NEW.target_profile_id IS NOT NULL OR NEW.target_task_id IS NOT NULL THEN
      RAISE EXCEPTION 'direct_client target must not set profile or task';
    END IF;
  ELSIF NEW.target_kind = 'cpa' THEN
    IF NEW.project_id IS NULL THEN
      RAISE EXCEPTION 'project_id required when target_kind=cpa';
    END IF;
    IF NEW.target_direct_client_id IS NOT NULL OR NEW.target_profile_id IS NOT NULL THEN
      RAISE EXCEPTION 'cpa target must not set direct_client or profile';
    END IF;
  ELSIF NEW.target_kind = 'hr' THEN
    IF NEW.target_profile_id IS NULL THEN
      RAISE EXCEPTION 'target_profile_id required when target_kind=hr';
    END IF;
    IF NEW.target_direct_client_id IS NOT NULL OR NEW.target_task_id IS NOT NULL THEN
      RAISE EXCEPTION 'hr target must not set direct_client or task';
    END IF;
  END IF;
  RETURN NEW;
END $$;
