-- fn: public.open_shift_handover(uuid,text,date)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.open_shift_handover(p_project_id uuid, p_shift_label text DEFAULT 'day'::text, p_shift_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  p_shift_date := COALESCE(p_shift_date, public.project_today(p_project_id));  -- S10 (D-05)
  IF p_shift_date > public.project_today(p_project_id) + 1 THEN RAISE EXCEPTION 'Fecha de turno no válida' USING ERRCODE = '22023'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  PERFORM pg_advisory_xact_lock(hashtext('shift_handovers:' || p_project_id::text));
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM shift_handovers WHERE project_id = p_project_id;
  INSERT INTO shift_handovers (org_id, project_id, seq, number, shift_date, shift_label, snapshot, opened_by)
  VALUES (v_org, p_project_id, v_seq, 'REL-' || lpad(v_seq::text, 4, '0'), p_shift_date, COALESCE(p_shift_label, 'day'),
          public.handover_snapshot(p_project_id), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
