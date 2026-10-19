-- fn: public.sign_system_gate(uuid, text, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.sign_system_gate(p_approval_id uuid, p_capacity text, p_comments text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appr   system_gate_approvals%ROWTYPE;
  v_gate   readiness_gates%ROWTYPE;
  v_role   text;
  v_level  text;
  v_signed integer;
BEGIN
  SELECT * INTO v_appr FROM system_gate_approvals
  WHERE id = p_approval_id AND revoked_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aprobación no encontrada o revocada' USING ERRCODE = 'P0002';
  END IF;

  SELECT om.role::text INTO v_role
  FROM org_members om WHERE om.org_id = v_appr.org_id AND om.user_id = auth.uid()
    AND public.is_project_member(v_appr.project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_gate FROM readiness_gates WHERE id = v_appr.gate_id;

  IF v_appr.status <> 'pending_signatures' THEN
    RAISE EXCEPTION 'La aprobación del gate % ya tiene todas sus firmas', v_gate.code USING ERRCODE = 'P0001';
  END IF;
  IF NOT (p_capacity = ANY (v_gate.required_signatures)) THEN
    RAISE EXCEPTION 'El gate % no requiere la firma %', v_gate.code, p_capacity USING ERRCODE = '22023';
  END IF;
  IF NOT (v_role = ANY (v_gate.cosign_roles)) THEN
    RAISE EXCEPTION 'Tu rol (%) no puede co-firmar el gate %', v_role, v_gate.code USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM system_gate_signatures WHERE approval_id = p_approval_id AND capacity = p_capacity) THEN
    RAISE EXCEPTION 'La firma % ya fue registrada', p_capacity USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM system_gate_signatures WHERE approval_id = p_approval_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ya firmaste este gate: cada firma debe ser de una persona distinta' USING ERRCODE = '23505';
  END IF;

  SELECT r.computed_level INTO v_level
  FROM public.compute_system_gates(v_appr.system_id) r WHERE r.gate_id = v_appr.gate_id;
  IF v_level IS NULL OR v_level = 'red' THEN
    RAISE EXCEPTION 'El gate % ya no cumple sus criterios: revisa los bloqueos antes de firmar', v_gate.code USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO system_gate_signatures (approval_id, org_id, project_id, capacity, user_id, user_role, comments)
  VALUES (p_approval_id, v_appr.org_id, v_appr.project_id, p_capacity, auth.uid(), v_role,
          NULLIF(left(btrim(COALESCE(p_comments, '')), 2000), ''));

  SELECT COUNT(DISTINCT s.capacity)::int INTO v_signed
  FROM system_gate_signatures s
  WHERE s.approval_id = p_approval_id AND s.capacity = ANY (v_gate.required_signatures);

  IF v_signed >= cardinality(v_gate.required_signatures) THEN
    UPDATE system_gate_approvals
       SET status = COALESCE(target_status, 'approved')
     WHERE id = p_approval_id;
    RETURN COALESCE(v_appr.target_status, 'approved');
  END IF;

  RETURN 'pending_signatures';
END;
$function$;
