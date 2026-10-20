-- fn: public.revoke_gate_attestation(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.revoke_gate_attestation(p_attestation_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_att system_gate_attestations%ROWTYPE;
  v_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 2000), '');
BEGIN
  SELECT * INTO v_att FROM system_gate_attestations WHERE id = p_attestation_id AND revoked_at IS NULL;
  IF NOT FOUND OR NOT public.is_project_editor(v_att.project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  -- S11 (D-21): con motivo y auditado; con el gate aprobado, el camino es revocar la aprobación.
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Explica por qué se retira la declaración (mínimo 10 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM gate_criteria gc JOIN system_gate_approvals a ON a.gate_id = gc.gate_id
             WHERE gc.id = v_att.criterion_id AND a.system_id = v_att.system_id AND a.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'El gate ya está aprobado: revoca primero la aprobación' USING ERRCODE = 'P0001';
  END IF;
  UPDATE system_gate_attestations
     SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = v_reason
   WHERE id = p_attestation_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_att.org_id, auth.uid(), 'gate_attestation', p_attestation_id, 'revoked',
          jsonb_build_object('systemId', v_att.system_id, 'criterionId', v_att.criterion_id, 'reason', v_reason));
END;
$function$;
