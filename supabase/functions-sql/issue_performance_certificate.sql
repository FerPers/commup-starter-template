-- fn: public.issue_performance_certificate(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.issue_performance_certificate(p_run_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_runs%ROWTYPE; t performance_tests%ROWTYPE; v_role text; v_live performance_certificates%ROWTYPE; v_seq integer; v_id uuid;
BEGIN
  SELECT * INTO r FROM performance_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores emiten el certificado' USING ERRCODE = '42501'; END IF;
  -- S14 (D14): quien emite firma como Comisionamiento; con designados, debe ser uno de ellos.
  IF NOT public.has_capacity(r.project_id, 'commissioning') THEN RAISE EXCEPTION 'No estás designado para firmar como Comisionamiento en este proyecto' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'evaluated' OR r.result NOT IN ('accepted', 'accepted_with_deviation') THEN
    RAISE EXCEPTION 'Solo se certifica un intento con resultado aceptado' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM performance_tests WHERE id = r.test_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM performance_certificates WHERE run_id = r.id) THEN RAISE EXCEPTION 'Este intento ya tiene certificado' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_live FROM performance_certificates WHERE test_id = t.id AND status IN ('pending_signatures', 'accepted');
  IF v_live.id IS NOT NULL THEN
    IF (SELECT attempt FROM performance_runs WHERE id = v_live.run_id) > r.attempt THEN
      RAISE EXCEPTION 'La prueba ya tiene un certificado de un intento posterior' USING ERRCODE = 'P0001';
    END IF;
    UPDATE performance_certificates SET status = 'superseded', superseded_at = now() WHERE id = v_live.id;
  END IF;
  v_seq := public.mgmt_next_seq('performance_certificates', r.project_id);
  INSERT INTO performance_certificates (org_id, project_id, seq, number, test_id, run_id, system_id, commissioning_signed_by, commissioning_signed_at)
  VALUES (r.org_id, r.project_id, v_seq, 'PTC-' || lpad(v_seq::text, 4, '0'), t.id, r.id, t.primary_system_id, auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
