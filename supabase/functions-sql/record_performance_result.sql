-- fn: public.record_performance_result(uuid,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.record_performance_result(p_run_id uuid, p_result text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r performance_runs%ROWTYPE; t performance_tests%ROWTYPE; v_role text; v_eval jsonb; v_reason text := public.mgmt_text(p_reason, 2000);
  v_hash text; v_seq integer; v_action uuid; v_failed text;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores registran el resultado' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'closed' THEN RAISE EXCEPTION 'Solo se registra el resultado de un intento cerrado' USING ERRCODE = 'P0001'; END IF;
  IF p_result NOT IN ('accepted', 'accepted_with_deviation', 'repeat', 'failed', 'inconclusive') THEN
    RAISE EXCEPTION 'Resultado no válido' USING ERRCODE = '22023';
  END IF;
  v_eval := public.performance_compute_evaluation(r.id);
  -- S25 (E-19): si las exclusiones cambian el resultado sugerido, el representante del cliente las reconoce antes.
  IF COALESCE((v_eval ->> 'exclusions_change_result')::boolean, false)
     AND EXISTS (SELECT 1 FROM performance_disturbances WHERE run_id = r.id AND excluded AND client_ack_by IS NULL) THEN
    RAISE EXCEPTION 'Las exclusiones cambian el resultado sugerido (sin ellas: «%»; con ellas: «%»): el representante del cliente debe reconocerlas',
      v_eval -> 'without_exclusions' ->> 'suggested', v_eval ->> 'suggested' USING ERRCODE = 'P0001';
  END IF;
  IF p_result <> (v_eval ->> 'suggested') AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'El resultado sugerido es «%»: indica por qué registras otro', v_eval ->> 'suggested' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM performance_tests WHERE id = r.test_id;
  v_eval := v_eval || jsonb_build_object('result', p_result, 'result_reason', v_reason, 'result_by', auth.uid(), 'result_at', now());
  v_hash := encode(sha256(convert_to(v_eval::text, 'UTF8')), 'hex');

  IF p_result IN ('failed', 'accepted_with_deviation') THEN
    SELECT string_agg(format('%s %s %s (obtenido %s)', x ->> 'variable_key', x ->> 'statistic', x ->> 'outcome', COALESCE(x ->> 'value', '—')), E'\n')
      INTO v_failed
    FROM jsonb_array_elements(v_eval -> 'criteria') x WHERE x ->> 'outcome' IN ('fail', 'within_uncertainty');
    v_seq := public.mgmt_next_seq('actions', r.project_id);
    INSERT INTO actions (org_id, project_id, seq, number, title, description, source_kind, source_id, source_ref,
                         system_id, owner_id, priority, verification_method, created_by)
    VALUES (r.org_id, r.project_id, v_seq, 'ACC-' || lpad(v_seq::text, 4, '0'),
            left(r.number || ' — ' || CASE p_result WHEN 'failed' THEN 'prueba de desempeño fallida' ELSE 'aceptada con desviación' END || ': ' || t.title, 200),
            concat_ws(E'\n', v_failed, v_reason),
            'performance', r.id, r.number, t.primary_system_id, auth.uid(),
            CASE p_result WHEN 'failed' THEN 'high' ELSE 'medium' END, 'test', auth.uid())
    RETURNING id INTO v_action;
    INSERT INTO mgmt_events (org_id, project_id, entity_kind, entity_id, action, to_value, user_id, comment)
    VALUES (r.org_id, r.project_id, 'action', v_action, 'created', 'open', auth.uid(), 'Automática: resultado de ' || r.number);
  END IF;

  UPDATE performance_runs SET status = 'evaluated', suggested_result = v_eval ->> 'suggested', result = p_result, result_reason = v_reason,
         result_by = auth.uid(), result_at = now(), evaluation = v_eval, evaluation_hash = v_hash, action_id = v_action, updated_at = now()
   WHERE id = r.id;
  RETURN v_action;
END;
$function$;
