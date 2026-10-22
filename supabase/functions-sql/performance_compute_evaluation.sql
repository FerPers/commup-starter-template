-- fn: public.performance_compute_evaluation(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.performance_compute_evaluation(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- S25 (E-19): con exclusiones, la evaluación trae también el resultado sin ellas y si cambian el sugerido; el
-- representante del cliente debe reconocerlas antes de registrar el resultado (record_performance_result).
DECLARE v jsonb; u jsonb; v_excl jsonb;
BEGIN
  v := public.performance_evaluate_core(p_run_id, false);
  SELECT jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'started_at', d.started_at, 'ended_at', d.ended_at,
           'reason', d.exclusion_reason, 'excluded_by', d.excluded_by, 'excluded_at', d.excluded_at,
           'client_ack_by', d.client_ack_by, 'client_ack_at', d.client_ack_at) ORDER BY d.started_at)
    INTO v_excl
  FROM performance_disturbances d WHERE d.run_id = p_run_id AND d.excluded;
  IF v_excl IS NULL THEN RETURN v; END IF;
  u := public.performance_evaluate_core(p_run_id, true);
  RETURN v || jsonb_build_object(
    'exclusions', v_excl,
    'without_exclusions', jsonb_build_object(
      'suggested', u ->> 'suggested', 'valid_min', u -> 'window' -> 'valid_min', 'reasons', u -> 'reasons',
      'criteria', COALESCE((SELECT jsonb_agg(jsonb_build_object('ord', x -> 'ord', 'value', x -> 'value', 'outcome', x -> 'outcome'))
                            FROM jsonb_array_elements(u -> 'criteria') x), '[]'::jsonb)),
    'exclusions_change_result', (u ->> 'suggested') IS DISTINCT FROM (v ->> 'suggested'));
END;
$function$;
