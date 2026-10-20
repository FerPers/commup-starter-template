-- fn: public.revoke_certificate(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.revoke_certificate(p_certificate_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c certificates%ROWTYPE; v_org uuid; v_reason text := public.mgmt_text(p_reason, 2000); v_sigs jsonb;
BEGIN
  SELECT * INTO c FROM certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = c.project_id;
  IF auth.uid() IS NULL OR NOT public.is_org_privileged(v_org) THEN RAISE EXCEPTION 'Solo owner, admin o arquitecto revocan certificados' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'issued' THEN RAISE EXCEPTION 'Solo se pueden revocar certificados emitidos' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Debes indicar un motivo (al menos 3 caracteres)' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId', user_id, 'role', role, 'signedAt', signed_at)), '[]') INTO v_sigs
  FROM certificate_signatures WHERE certificate_id = c.id;
  DELETE FROM certificate_signatures WHERE certificate_id = c.id;
  UPDATE certificates SET status = 'rejected', is_blocked = false, block_reason = NULL WHERE id = c.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'certificate', c.id, 'revoked', jsonb_build_object('projectId', c.project_id, 'reason', v_reason, 'previousSignatures', v_sigs));
  RETURN v_sigs;
END;
$function$;
