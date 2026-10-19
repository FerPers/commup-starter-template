-- fn: public.update_punch_ops_status(uuid, text, text, date)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.update_punch_ops_status(p_punch_id uuid, p_new_status text, p_notes text DEFAULT NULL::text, p_target_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_cur_status TEXT;
BEGIN
  SELECT pu.project_id, pu.post_handover_status
    INTO v_project_id, v_cur_status
    FROM punches pu WHERE pu.id = p_punch_id;

  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Punch not found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT is_project_member(v_project_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_cur_status IS NULL OR v_cur_status = 'active' THEN
    RAISE EXCEPTION 'El punch no está transferido a Operaciones' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_status NOT IN (
    'in_progress_ops','deferred','resolved_ops','verified_ops','closed_final','cancelled_ops'
  ) THEN
    RAISE EXCEPTION 'Invalid post-handover status: %', p_new_status;
  END IF;

  UPDATE punches SET
    post_handover_status = p_new_status,
    ops_notes            = COALESCE(p_notes, ops_notes),
    ops_target_date      = COALESCE(p_target_date, ops_target_date),
    closed_date          = CASE WHEN p_new_status = 'closed_final' THEN CURRENT_DATE ELSE closed_date END,
    status               = CASE WHEN p_new_status = 'closed_final' THEN 'closed'::punch_status ELSE status END
  WHERE id = p_punch_id;

  INSERT INTO punch_post_handover_events(
    punch_id, event_type, from_status, to_status, performed_by, notes
  ) VALUES (
    p_punch_id,
    CASE WHEN p_new_status = 'closed_final' THEN 'closed' ELSE 'status_change' END,
    v_cur_status, p_new_status, auth.uid(), p_notes
  );

  RETURN p_punch_id;
END;
$function$;
