-- fn: public.startup_prerequisites(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.startup_prerequisites(p_system_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_proj uuid; v_org uuid; v_gate readiness_gates%ROWTYPE; v_appr text; v_pssr jsonb; v_regressed boolean;
BEGIN
  SELECT s.project_id, p.org_id INTO v_proj, v_org FROM systems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_system_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Sistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(v_proj) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  -- S11 (E-07): el gate de arranque está marcado en la configuración (is_startup_gate). Sin marca, se infiere
  -- como antes pero nunca un gate que exige prueba de desempeño (esa prueba necesita la planta arrancada).
  SELECT * INTO v_gate FROM readiness_gates WHERE org_id = v_org AND is_active
   ORDER BY is_startup_gate DESC, (NOT requires_performance) DESC, requires_lineup DESC, order_index DESC, code DESC LIMIT 1;
  SELECT status INTO v_appr FROM system_gate_approvals WHERE system_id = p_system_id AND gate_id = v_gate.id AND revoked_at IS NULL;
  -- S11 (D-02): un gate aprobado pero en regresión no habilita el arranque.
  v_regressed := v_appr IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.compute_system_gates_upto(p_system_id, v_gate.order_index) cg WHERE cg.gate_id = v_gate.id AND cg.status = 'regressed');
  -- S11 (D-11): la misma regla PSSR que el gate (el más reciente).
  v_pssr := public.system_pssr_status(p_system_id);
  RETURN jsonb_build_object(
    'gate_id', v_gate.id, 'gate_code', v_gate.code,
    'gate_status', CASE WHEN v_regressed THEN 'regressed' ELSE COALESCE(v_appr, 'not_approved') END,
    'gate_ok', COALESCE(v_appr IN ('approved', 'approved_with_conditions'), false) AND NOT v_regressed,
    'pssr_number', v_pssr ->> 'review_number', 'pssr_status', COALESCE(v_pssr ->> 'review_status', 'none'),
    'pssr_ok', COALESCE(v_pssr ->> 'review_status' = 'approved', false));
END;
$function$;
