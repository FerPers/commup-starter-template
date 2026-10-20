-- fn: public.reopen_certificate(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.reopen_certificate(p_certificate_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c certificates%ROWTYPE; v_org uuid; v_reason text := public.mgmt_text(p_reason, 2000); v_block text;
BEGIN
  SELECT * INTO c FROM certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificado no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = c.project_id;
  IF auth.uid() IS NULL OR NOT public.is_org_privileged(v_org) THEN RAISE EXCEPTION 'Solo owner, admin o arquitecto reabren certificados' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'rejected' THEN RAISE EXCEPTION 'Solo se pueden reabrir certificados rechazados' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Debes indicar un motivo (al menos 3 caracteres)' USING ERRCODE = '22023'; END IF;
  IF c.subsystem_id IS NOT NULL THEN
    v_block := public.certificate_blocker(c.subsystem_id, c.phase_id, ARRAY(SELECT punch_id FROM certificate_punch_exceptions WHERE certificate_id = c.id));
    IF v_block IS NOT NULL THEN RAISE EXCEPTION 'No se puede reabrir: %', v_block USING ERRCODE = 'P0001'; END IF;
    v_block := public.certificate_previous_blocker(c.subsystem_id, c.phase_id);
    IF v_block IS NOT NULL THEN RAISE EXCEPTION 'No se puede reabrir: %', v_block USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM certificates WHERE subsystem_id = c.subsystem_id AND phase_id = c.phase_id AND status = 'issued' AND id <> c.id) THEN
      RAISE EXCEPTION 'El subsistema ya tiene otro certificado emitido en esta fase' USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE certificates SET status = 'issued', is_blocked = false, block_reason = NULL WHERE id = c.id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'certificate', c.id, 'reopened', jsonb_build_object('projectId', c.project_id, 'reason', v_reason));
END;
$function$;
