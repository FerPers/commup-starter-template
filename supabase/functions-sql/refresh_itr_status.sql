-- fn: public.refresh_itr_status(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.refresh_itr_status(p_itr_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v itrs; e jsonb; v_status text; v_complete boolean; v_fail boolean;
BEGIN
  -- S05 (C-34/C-10): el estado y el avance del ITR SALEN del contenido (evaluate_itr_capture) y de las firmas;
  -- nadie los escribe por REST (guard_itr_derived). Lo llaman las acciones tras guardar respuestas o evidencias.
  SELECT * INTO v FROM itrs WHERE id = p_itr_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v.project_id) THEN
    RAISE EXCEPTION 'ITR unavailable' USING ERRCODE = '42501';
  END IF;
  IF v.status = 'approved' OR EXISTS (SELECT 1 FROM itr_signatures WHERE itr_id = p_itr_id) THEN
    RETURN jsonb_build_object('status', v.status, 'progress_pct', v.progress_pct, 'changed', false);
  END IF;
  e := public.evaluate_itr_capture(p_itr_id);
  v_complete := COALESCE((e->>'is_complete')::boolean, false);
  v_fail := COALESCE((e->>'has_critical_fail')::boolean, false);
  v_status := CASE WHEN v_fail THEN 'rejected' WHEN v_complete THEN 'completed'
                   WHEN COALESCE((e->>'completed_count')::int, 0) > 0 THEN 'in_progress' ELSE 'not_started' END;
  UPDATE itrs SET status = v_status::itr_status, progress_pct = COALESCE((e->>'progress_pct')::numeric, 0),
    completed_date = CASE WHEN v_complete AND NOT v_fail THEN COALESCE(v.completed_date, CURRENT_DATE) ELSE NULL END
  WHERE id = p_itr_id;
  RETURN jsonb_build_object('status', v_status, 'progress_pct', COALESCE((e->>'progress_pct')::numeric, 0), 'changed', v_status IS DISTINCT FROM v.status::text);
END;
$function$;
