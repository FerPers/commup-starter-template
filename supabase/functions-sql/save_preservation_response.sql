-- fn: public.save_preservation_response(uuid, uuid, boolean, numeric, text, boolean)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.save_preservation_response(p_record_id uuid, p_item_id uuid, p_value_bool boolean DEFAULT NULL::boolean, p_value_numeric numeric DEFAULT NULL::numeric, p_value_text text DEFAULT NULL::text, p_is_passed boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_rec preservation_records; v_plan preservation_plans;
BEGIN
  -- S08 (C-05): el inspector guarda y corrige respuestas de un registro abierto (antes la RLS de UPDATE era
  -- solo de editores y el upsert fallaba, o afectaba 0 filas sin error).
  SELECT * INTO v_rec FROM preservation_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_plan FROM preservation_plans WHERE id = v_rec.plan_id;
  IF auth.uid() IS NULL OR NOT public.is_project_field_member(v_plan.project_id) THEN
    RAISE EXCEPTION 'Sin permiso para ejecutar la preservación' USING ERRCODE = '42501';
  END IF;
  IF v_rec.status <> 'open' THEN RAISE EXCEPTION 'El registro ya fue finalizado' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM preservation_procedure_items WHERE id = p_item_id AND procedure_id = v_plan.procedure_id) THEN
    RAISE EXCEPTION 'El ítem no pertenece al procedimiento del plan' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO preservation_record_responses (record_id, item_id, value_bool, value_numeric, value_text, is_passed, responded_at, responded_by)
  VALUES (p_record_id, p_item_id, p_value_bool, p_value_numeric, NULLIF(btrim(COALESCE(p_value_text, '')), ''), p_is_passed, now(), auth.uid())
  ON CONFLICT (record_id, item_id) DO UPDATE SET
    value_bool = EXCLUDED.value_bool, value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
    is_passed = EXCLUDED.is_passed, responded_at = EXCLUDED.responded_at, responded_by = EXCLUDED.responded_by;
END;
$function$;
