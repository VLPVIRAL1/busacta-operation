CREATE OR REPLACE FUNCTION public.fn_time_logs_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_before jsonb;
  v_after jsonb;
  v_fields text[] := ARRAY[]::text[];
  v_bulk uuid;
  v_actor uuid;
BEGIN
  BEGIN
    v_bulk := NULLIF(current_setting('app.bulk_op_id', true), '')::uuid;
  EXCEPTION WHEN others THEN v_bulk := NULL;
  END;
  v_actor := auth.uid();

  IF (TG_OP = 'INSERT') THEN
    v_action := 'create';
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF (TG_OP = 'UPDATE') THEN
    v_action := CASE WHEN v_bulk IS NOT NULL THEN 'bulk_update' ELSE 'update' END;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    IF COALESCE(OLD.break_minutes, -1) IS DISTINCT FROM COALESCE(NEW.break_minutes, -1) THEN v_fields := array_append(v_fields, 'break_minutes'::text); END IF;
    IF COALESCE(OLD.effective_override, -1) IS DISTINCT FROM COALESCE(NEW.effective_override, -1) THEN v_fields := array_append(v_fields, 'effective_override'::text); END IF;
    IF COALESCE(OLD.note, '') IS DISTINCT FROM COALESCE(NEW.note, '') THEN v_fields := array_append(v_fields, 'note'::text); END IF;
    IF COALESCE(OLD.billable, false) IS DISTINCT FROM COALESCE(NEW.billable, false) THEN v_fields := array_append(v_fields, 'billable'::text); END IF;
    IF COALESCE(OLD.started_at, 'epoch'::timestamptz) IS DISTINCT FROM COALESCE(NEW.started_at, 'epoch'::timestamptz) THEN v_fields := array_append(v_fields, 'started_at'::text); END IF;
    IF COALESCE(OLD.ended_at, 'epoch'::timestamptz) IS DISTINCT FROM COALESCE(NEW.ended_at, 'epoch'::timestamptz) THEN v_fields := array_append(v_fields, 'ended_at'::text); END IF;
    IF COALESCE(OLD.duration_minutes, -1) IS DISTINCT FROM COALESCE(NEW.duration_minutes, -1) THEN v_fields := array_append(v_fields, 'duration_minutes'::text); END IF;
    IF array_length(v_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.time_log_audit (time_log_id, actor_id, action, before, after, fields, bulk_op_id)
  VALUES (NEW.id, v_actor, v_action, v_before, v_after, v_fields, v_bulk);

  RETURN NEW;
END;
$function$;