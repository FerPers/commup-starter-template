-- fn: public.refresh_certificate_block(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.refresh_certificate_block(p_certificate_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c certificates%ROWTYPE; v_reason text; v_org uuid;
BEGIN
  SELECT * INTO c FROM certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'issued' OR c.subsystem_id IS NULL THEN RETURN; END IF;
  v_reason := public.certificate_blocker(c.subsystem_id, c.phase_id,
                ARRAY(SELECT punch_id FROM certificate_punch_exceptions WHERE certificate_id = c.id));
  IF (v_reason IS NOT NULL) IS DISTINCT FROM c.is_blocked OR v_reason IS DISTINCT FROM c.block_reason THEN
    UPDATE certificates SET is_blocked = v_reason IS NOT NULL, block_reason = v_reason WHERE id = c.id;
    -- activity_log exige usuario: los cambios por service role (cron, API) quedan solo en el certificado.
    IF (v_reason IS NOT NULL) IS DISTINCT FROM c.is_blocked AND auth.uid() IS NOT NULL THEN
      SELECT org_id INTO v_org FROM projects WHERE id = c.project_id;
      INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
      VALUES (v_org, auth.uid(), 'certificate', c.id,
              CASE WHEN v_reason IS NOT NULL THEN 'blocked' ELSE 'unblocked' END,
              jsonb_build_object('reason', v_reason, 'certNumber', c.certificate_number));
    END IF;
  END IF;
END;
$function$;
