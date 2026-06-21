CREATE OR REPLACE FUNCTION public.validate_rule_blueprint()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  bp jsonb := COALESCE(NEW.split_blueprint_json, '[]'::jsonb);
  elem jsonb;
  remainder_count int := 0;
  amt numeric;
BEGIN
  IF jsonb_typeof(bp) <> 'array' THEN
    RAISE EXCEPTION 'RULE_BLUEPRINT_INVALID: split_blueprint_json must be a JSON array'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(bp) = 0 THEN
    RETURN NEW;
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(bp) LOOP
    IF COALESCE((elem->>'is_remainder')::boolean, false) THEN
      remainder_count := remainder_count + 1;
    ELSE
      IF (elem->>'account_id') IS NULL OR length(elem->>'account_id') = 0 THEN
        RAISE EXCEPTION 'RULE_BLUEPRINT_INVALID: fixed rows require account_id'
          USING ERRCODE = '23514';
      END IF;
      amt := COALESCE((elem->>'amount')::numeric, 0);
      IF amt < 0 THEN
        RAISE EXCEPTION 'RULE_BLUEPRINT_INVALID: amounts must be non-negative (got %)', amt
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  IF remainder_count > 1 THEN
    RAISE EXCEPTION 'RULE_BLUEPRINT_INVALID: at most one remainder row allowed (found %)', remainder_count
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_split_blueprint ON public.bank_match_rules;
CREATE TRIGGER trg_validate_split_blueprint
  BEFORE INSERT OR UPDATE OF split_blueprint_json ON public.bank_match_rules
  FOR EACH ROW EXECUTE FUNCTION public.validate_rule_blueprint();