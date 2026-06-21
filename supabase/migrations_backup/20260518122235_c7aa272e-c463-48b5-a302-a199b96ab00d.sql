-- Bulk update helper. Returns the count of rows updated and the bulk_op_id used.
CREATE OR REPLACE FUNCTION public.bulk_update_time_logs(
  p_bulk_op_id uuid,
  p_ids uuid[],
  p_set_effective boolean DEFAULT false,
  p_effective_override integer DEFAULT NULL,
  p_set_break boolean DEFAULT false,
  p_break_minutes integer DEFAULT NULL,
  p_note_mode text DEFAULT 'none',     -- 'none' | 'replace' | 'append'
  p_note_value text DEFAULT NULL
)
RETURNS TABLE(updated_count int, bulk_op_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  PERFORM set_config('app.bulk_op_id', p_bulk_op_id::text, true);

  UPDATE public.time_logs t
  SET
    effective_override = CASE
      WHEN p_set_effective THEN GREATEST(0, COALESCE(p_effective_override, 0))
      ELSE t.effective_override
    END,
    effective_edited_by = CASE
      WHEN p_set_effective THEN auth.uid()
      ELSE t.effective_edited_by
    END,
    effective_edited_at = CASE
      WHEN p_set_effective THEN now()
      ELSE t.effective_edited_at
    END,
    break_minutes = CASE
      WHEN p_set_break THEN GREATEST(0, COALESCE(p_break_minutes, 0))
      ELSE t.break_minutes
    END,
    note = CASE
      WHEN p_note_mode = 'replace' THEN p_note_value
      WHEN p_note_mode = 'append'  THEN COALESCE(t.note, '') || COALESCE(p_note_value, '')
      ELSE t.note
    END
  WHERE t.id = ANY(p_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count, p_bulk_op_id;
END;
$$;

-- Undo a bulk op: read latest audit row for each affected time_log under bulk_op_id,
-- restore the `before` snapshot's editable fields, and record an 'undo' audit row
-- (the trigger writes audits for the new UPDATEs).
CREATE OR REPLACE FUNCTION public.undo_bulk_op(p_bulk_op_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count int := 0;
  v_undo_id uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('app.bulk_op_id', v_undo_id::text, true);

  FOR r IN
    SELECT DISTINCT ON (time_log_id)
      time_log_id, before
    FROM public.time_log_audit
    WHERE bulk_op_id = p_bulk_op_id
    ORDER BY time_log_id, created_at DESC
  LOOP
    UPDATE public.time_logs t
    SET
      effective_override = NULLIF((r.before->>'effective_override'), '')::int,
      break_minutes      = COALESCE(NULLIF((r.before->>'break_minutes'), ''), '0')::int,
      note               = r.before->>'note',
      billable           = COALESCE((r.before->>'billable')::boolean, true)
    WHERE t.id = r.time_log_id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_update_time_logs(uuid, uuid[], boolean, integer, boolean, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.undo_bulk_op(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_time_logs(uuid, uuid[], boolean, integer, boolean, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_bulk_op(uuid) TO authenticated;