-- fn: public.set_performance_disturbance_exclusion(uuid,boolean,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.set_performance_disturbance_exclusion(p_disturbance_id uuid, p_excluded boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d performance_disturbances%ROWTYPE; r performance_runs%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO d FROM performance_disturbances WHERE id = p_disturbance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perturbación no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO r FROM performance_runs WHERE id = d.run_id;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores excluyen perturbaciones del cálculo' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('formal', 'closed') THEN RAISE EXCEPTION 'Solo se excluyen perturbaciones del periodo formal' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_excluded, false) = d.excluded THEN RETURN; END IF;
  -- S25 (E-19): cambiar una exclusión invalida el reconocimiento del cliente.
  UPDATE performance_disturbances SET excluded = COALESCE(p_excluded, false), exclusion_reason = v_reason, excluded_by = auth.uid(), excluded_at = now(),
         client_ack_by = NULL, client_ack_at = NULL
   WHERE id = d.id;
END;
$function$;
