-- fn: public.refreeze_performance_run(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.refreeze_performance_run(p_run_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_runs%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'closed' THEN RAISE EXCEPTION 'Solo se re-congela un intento cerrado' USING ERRCODE = 'P0001'; END IF;
  RETURN public.performance_freeze_run(r.id);
END;
$function$;
