-- fn: public.transition_procedure_run(uuid,text,text,timestamp with time zone)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.transition_procedure_run(p_run_id uuid, p_to text, p_comment text DEFAULT NULL::text, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_runs%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text := public.mgmt_text(p_comment, 2000);
BEGIN
  SELECT * INTO r FROM procedure_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ejecución no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF p_to = 'stopped' AND r.status IN ('in_progress', 'at_hold') THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica qué criterio de parada se cumplió' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = 'stopped', stopped_by = v_uid, stopped_at = public.startup_field_time(p_captured_at, r.started_at), stop_reason = v_comment,
           stop_synced_at = CASE WHEN p_captured_at IS NULL THEN NULL ELSE now() END, updated_at = now() WHERE id = r.id;
    -- S25 (E-10): cada parada queda en la línea de tiempo; las columnas guardan solo la última.
    PERFORM public.log_procedure_run_event(r, 'stopped', NULL, v_comment, public.startup_field_time(p_captured_at, r.started_at));
  ELSIF p_to = 'in_progress' AND r.status = 'stopped' THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores reanudan una ejecución detenida' USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué es seguro reanudar' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = CASE WHEN EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = r.id AND status = 'at_hold') THEN 'at_hold' ELSE 'in_progress' END,
           updated_at = now() WHERE id = r.id;
    PERFORM public.log_procedure_run_event(r, 'resumed', NULL, v_comment, NULL);
  ELSIF p_to = 'completed' AND r.status = 'in_progress' THEN
    IF EXISTS (SELECT 1 FROM procedure_run_steps WHERE run_id = r.id AND status NOT IN ('done', 'released', 'na')) THEN
      RAISE EXCEPTION 'Quedan pasos sin completar o hold points sin liberar' USING ERRCODE = 'P0001';
    END IF;
    UPDATE procedure_runs SET status = 'completed', completed_by = v_uid, completed_at = now(), updated_at = now() WHERE id = r.id;
    PERFORM public.log_procedure_run_event(r, 'completed', NULL, NULL, NULL);
  ELSIF p_to = 'aborted' AND r.status IN ('in_progress', 'at_hold', 'stopped') THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Solo líderes o superiores abortan una ejecución' USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
    UPDATE procedure_runs SET status = 'aborted', aborted_by = v_uid, aborted_at = now(), abort_reason = v_comment, updated_at = now() WHERE id = r.id;
    PERFORM public.log_procedure_run_event(r, 'aborted', NULL, v_comment, NULL);
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$function$;
