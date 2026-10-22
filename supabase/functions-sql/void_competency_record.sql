-- fn: public.void_competency_record(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.void_competency_record(p_record_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c competency_records%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO c FROM competency_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(c.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR NOT (v_role IN ('owner', 'admin', 'architect', 'leader') OR c.assessed_by = auth.uid()) THEN
    RAISE EXCEPTION 'Anula un registro un líder o quien lo registró' USING ERRCODE = '42501';
  END IF;
  IF c.voided_at IS NOT NULL THEN RAISE EXCEPTION 'El registro ya está anulado' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Indica el motivo (10 caracteres o más)' USING ERRCODE = '22023'; END IF;
  UPDATE competency_records SET voided_by = auth.uid(), voided_at = now(), void_reason = v_reason WHERE id = c.id;
END;
$function$;
