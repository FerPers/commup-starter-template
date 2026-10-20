-- fn: public.finalize_preservation_record(uuid, public.preservation_result, text, public.punch_category)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.finalize_preservation_record(p_record_id uuid, p_result public.preservation_result, p_remarks text DEFAULT NULL::text, p_punch_category public.punch_category DEFAULT NULL::public.punch_category)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rec preservation_records; v_plan preservation_plans; v_tag tags; v_proc preservation_procedures;
  v_org uuid; v_remarks text := NULLIF(btrim(COALESCE(p_remarks, '')), '');
  v_punch uuid; v_number text;
BEGIN
  -- S08 (C-05/C-06/I-03, D10): finalizar es lo que cuenta. En una transacción: cierra el registro, avanza la
  -- próxima fecha del plan (con cualquier resultado) y, si el resultado es NOK, levanta el punch (obligatorio).
  SELECT * INTO v_rec FROM preservation_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_plan FROM preservation_plans WHERE id = v_rec.plan_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT public.is_project_field_member(v_plan.project_id) THEN
    RAISE EXCEPTION 'Sin permiso para ejecutar la preservación' USING ERRCODE = '42501';
  END IF;
  IF v_rec.status <> 'open' THEN RAISE EXCEPTION 'Este registro ya fue finalizado' USING ERRCODE = 'P0001'; END IF;
  IF p_result = 'nok' AND p_punch_category IS NULL THEN
    RAISE EXCEPTION 'Un resultado NOK genera un punch: indica su categoría' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tag FROM tags WHERE id = v_plan.tag_id;
  SELECT * INTO v_proc FROM preservation_procedures WHERE id = v_plan.procedure_id;
  SELECT org_id INTO v_org FROM projects WHERE id = v_plan.project_id;

  IF p_result = 'nok' THEN
    INSERT INTO punches (project_id, subsystem_id, tag_id, preservation_record_id, category, description, discipline_id,
                         raised_by, punch_number, status, priority, created_via)
    VALUES (v_plan.project_id, v_tag.subsystem_id, v_tag.id, p_record_id, p_punch_category,
            '[Preservación NOK] ' || COALESCE(v_proc.code, 'PRES') || ' en ' || v_tag.tag_number
              || COALESCE(' — ' || NULLIF(v_proc.title, ''), '') || COALESCE(E'\n' || v_remarks, ''),
            v_tag.discipline_id, auth.uid(), '', 'open',
            CASE WHEN p_punch_category = 'A' THEN 'critical'::punch_priority ELSE 'major'::punch_priority END, 'preservation')
    RETURNING id, punch_number INTO v_punch, v_number;
  END IF;

  UPDATE preservation_records SET result = p_result, remarks = v_remarks, status = 'finalized', performed_by = auth.uid(),
    performed_at = now(), punch_raised = v_punch IS NOT NULL, punch_id = v_punch
  WHERE id = p_record_id;
  UPDATE preservation_plans SET last_performed_date = CURRENT_DATE, next_due_date = CURRENT_DATE + COALESCE(v_proc.interval_days, 0)
  WHERE id = v_plan.id;

  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'preservation_record', p_record_id, 'finalized',
          jsonb_build_object('planId', v_plan.id, 'tagId', v_tag.id, 'result', p_result, 'punchNumber', v_number,
                             'nextDueDate', CURRENT_DATE + COALESCE(v_proc.interval_days, 0)));
  RETURN jsonb_build_object('punch_number', v_number, 'next_due_date', CURRENT_DATE + COALESCE(v_proc.interval_days, 0));
END;
$function$;
