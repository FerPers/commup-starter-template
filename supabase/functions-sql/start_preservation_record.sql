-- fn: public.start_preservation_record(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.start_preservation_record(p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_plan preservation_plans; v_id uuid;
BEGIN
  -- S08 (C-05/C-06/I-03): abrir la ejecución no cuenta como mantenimiento hecho (la fecha avanza al finalizar)
  -- y es idempotente: un solo registro abierto por plan (índice único), así dos toques no crean dos.
  SELECT * INTO v_plan FROM preservation_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_field_member(v_plan.project_id) THEN
    RAISE EXCEPTION 'Sin permiso para ejecutar la preservación' USING ERRCODE = '42501';
  END IF;
  IF v_plan.status <> 'active' THEN RAISE EXCEPTION 'El plan no está activo' USING ERRCODE = 'P0001'; END IF;

  SELECT id INTO v_id FROM preservation_records WHERE plan_id = p_plan_id AND status = 'open';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO preservation_records (plan_id, tag_id, performed_by, performed_at, result, status)
  VALUES (p_plan_id, v_plan.tag_id, auth.uid(), now(), 'na', 'open')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
