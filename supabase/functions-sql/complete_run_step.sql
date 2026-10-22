-- fn: public.complete_run_step(uuid,uuid,text,text,boolean,timestamp with time zone)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.complete_run_step(p_run_id uuid, p_step_id uuid, p_actual text DEFAULT NULL::text, p_comment text DEFAULT NULL::text, p_na boolean DEFAULT false, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_runs%ROWTYPE; rs procedure_run_steps%ROWTYPE; st procedure_steps%ROWTYPE; v_role text; v_to text;
        v_comment text := public.mgmt_text(p_comment, 2000); v_floor timestamptz; v_at timestamptz;
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status = 'at_hold' THEN RAISE EXCEPTION 'La ejecución está detenida en un hold point: debe liberarse antes de seguir' USING ERRCODE = 'P0001'; END IF;
  IF r.status <> 'in_progress' THEN RAISE EXCEPTION 'La ejecución no está en curso (%)', r.status USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO rs FROM procedure_run_steps WHERE run_id = p_run_id AND step_id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paso no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF rs.status <> 'pending' THEN RAISE EXCEPTION 'El paso % ya fue registrado', rs.ord USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = p_run_id AND ord < rs.ord AND status NOT IN ('done', 'released', 'na')) THEN
    RAISE EXCEPTION 'Completa los pasos anteriores antes del paso %', rs.ord USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO st FROM procedure_steps WHERE id = p_step_id;
  IF p_na THEN
    IF st.is_hold_point THEN RAISE EXCEPTION 'Un hold point no puede marcarse N/A' USING ERRCODE = 'P0001'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué el paso no aplica' USING ERRCODE = '22023'; END IF;
    v_to := 'na';
  ELSIF st.is_hold_point THEN v_to := 'at_hold';
  ELSE v_to := 'done';
  END IF;
  SELECT GREATEST(r.started_at, MAX(GREATEST(done_at, COALESCE(released_at, done_at)))) INTO v_floor
    FROM procedure_run_steps WHERE run_id = p_run_id AND ord < rs.ord;
  v_at := public.startup_field_time(p_captured_at, COALESCE(v_floor, r.started_at));
  UPDATE procedure_run_steps SET status = v_to, actual_value = public.mgmt_text(p_actual, 500), comment = v_comment, done_by = auth.uid(), done_at = v_at,
         synced_at = CASE WHEN p_captured_at IS NULL THEN NULL ELSE now() END
   WHERE run_id = p_run_id AND step_id = p_step_id;
  UPDATE procedure_runs SET status = CASE WHEN v_to = 'at_hold' THEN 'at_hold' ELSE status END, updated_at = now() WHERE id = p_run_id;
  RETURN v_to;
END;
$function$;
