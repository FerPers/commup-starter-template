-- fn: public.evaluate_performance_run(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.evaluate_performance_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_runs%ROWTYPE;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(r.project_id) THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF r.status = 'evaluated' THEN RETURN r.evaluation; END IF;
  IF r.status <> 'closed' THEN RAISE EXCEPTION 'Solo se evalúa un intento cerrado' USING ERRCODE = 'P0001'; END IF;
  -- S10 (B-26): la evaluación previa se guarda al calcularla; los triggers performance_eval_preview_reset la
  -- borran si cambian el intento, sus datos o sus perturbaciones. Registrar el resultado recalcula siempre.
  IF r.evaluation_preview IS NOT NULL THEN RETURN r.evaluation_preview; END IF;
  r.evaluation_preview := public.performance_compute_evaluation(r.id);
  UPDATE performance_runs SET evaluation_preview = r.evaluation_preview WHERE id = r.id;
  RETURN r.evaluation_preview;
END;
$function$;
