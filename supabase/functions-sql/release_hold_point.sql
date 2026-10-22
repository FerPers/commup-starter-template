-- fn: public.release_hold_point(uuid,uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.release_hold_point(p_run_id uuid, p_step_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_runs%ROWTYPE; rs procedure_run_steps%ROWTYPE; st procedure_steps%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  SELECT * INTO rs FROM procedure_run_steps WHERE run_id = p_run_id AND step_id = p_step_id FOR UPDATE;
  IF NOT FOUND OR rs.status <> 'at_hold' THEN RAISE EXCEPTION 'El paso no está esperando liberación' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO st FROM procedure_steps WHERE id = p_step_id;
  -- S14 (D14): firmante designado del proyecto (o, sin designados, el rol de respaldo).
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT public.has_capacity(r.project_id, st.hold_capacity) THEN
    RAISE EXCEPTION 'No estás designado para liberar un hold point de %', st.hold_capacity USING ERRCODE = '42501';
  END IF;
  IF auth.uid() = rs.done_by THEN RAISE EXCEPTION 'Libera el hold point una persona distinta de quien ejecutó el paso' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('at_hold', 'stopped') THEN RAISE EXCEPTION 'La ejecución no está detenida en un hold point' USING ERRCODE = 'P0001'; END IF;
  -- S25 (E-09): el comentario de quien libera va aparte; el de quien ejecutó el paso no se toca.
  UPDATE procedure_run_steps SET status = 'released', released_by = auth.uid(), released_at = now(), release_role = st.hold_capacity,
         release_comment = public.mgmt_text(p_comment, 2000)
   WHERE run_id = p_run_id AND step_id = p_step_id;
  PERFORM public.log_procedure_run_event(r, 'hold_released', p_step_id, public.mgmt_text(p_comment, 2000), NULL);
  UPDATE procedure_runs SET status = CASE WHEN status = 'at_hold' THEN 'in_progress' ELSE status END, updated_at = now() WHERE id = p_run_id;
END;
$function$;
