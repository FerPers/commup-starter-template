-- fn: public.revoke_system_gate_approval(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.revoke_system_gate_approval(p_approval_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appr system_gate_approvals%ROWTYPE;
  v_role text;
  v_gate readiness_gates%ROWTYPE;
BEGIN
  SELECT * INTO v_appr FROM system_gate_approvals WHERE id = p_approval_id AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aprobación no encontrada o ya revocada' USING ERRCODE = 'P0002';
  END IF;

  SELECT om.role::text INTO v_role
  FROM org_members om WHERE om.org_id = v_appr.org_id AND om.user_id = auth.uid();
  SELECT * INTO v_gate FROM readiness_gates WHERE id = v_appr.gate_id;
  IF v_role IS NULL OR NOT (v_role IN ('owner', 'admin') OR v_role = ANY (v_gate.approval_roles)) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Indica el motivo de la revocación' USING ERRCODE = '22023';
  END IF;

  UPDATE system_gate_approvals
     SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = left(btrim(p_reason), 2000)
   WHERE id = p_approval_id;
END;
$function$;
