-- fn: public.withdraw_performance_test(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.withdraw_performance_test(p_test_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE t performance_tests%ROWTYPE; v_role text; v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 2000), '');
BEGIN
  SELECT * INTO t FROM performance_tests WHERE id = p_test_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prueba no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(t.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un líder o superior retira una prueba de desempeño' USING ERRCODE = '42501';
  END IF;
  IF t.status = 'withdrawn' THEN RAISE EXCEPTION 'La prueba % ya está retirada', t.number USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Explica por qué se retira (mínimo 10 caracteres)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM performance_runs WHERE test_id = t.id AND status IN ('planned', 'stabilizing', 'formal')) THEN
    RAISE EXCEPTION 'La prueba tiene un intento en curso: ciérralo o abórtalo primero' USING ERRCODE = 'P0001';
  END IF;
  UPDATE performance_tests SET status = 'withdrawn', withdrawn_by = auth.uid(), withdrawn_at = now(), withdraw_reason = v_reason, updated_at = now()
   WHERE id = t.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (t.org_id, auth.uid(), 'performance_test', t.id, 'withdrawn', jsonb_build_object('number', t.number, 'reason', v_reason));
END;
$function$;
