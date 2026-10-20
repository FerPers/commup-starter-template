-- fn: public.certificate_eligibility(uuid,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.certificate_eligibility(p_subsystem_id uuid, p_phase_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_org uuid; v_total int; v_approved int; v_cat_a int; v_cat_b jsonb; v_nb int; v_limit int; v_settings jsonb; v_level text;
BEGIN
  SELECT s.project_id, p.org_id INTO v_project, v_org FROM subsystems s JOIN projects p ON p.id = s.project_id WHERE s.id = p_subsystem_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Subsistema no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(v_project) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT count(*), count(*) FILTER (WHERE status = 'approved') INTO v_total, v_approved
  FROM itrs WHERE subsystem_id = p_subsystem_id AND phase_id = p_phase_id;
  SELECT count(*) FILTER (WHERE category = 'A'),
         COALESCE(jsonb_agg(jsonb_build_object('id', id, 'punch_number', punch_number, 'description', description) ORDER BY punch_number)
                  FILTER (WHERE category = 'B'), '[]'::jsonb)
    INTO v_cat_a, v_cat_b
  FROM punches WHERE subsystem_id = p_subsystem_id AND status IN ('open', 'in_progress');
  v_nb := jsonb_array_length(v_cat_b);
  SELECT settings INTO v_settings FROM organizations WHERE id = v_org;
  -- Límite Cat B: ausente = 3; null = sin límite (= resolveCatBLimit).
  v_limit := CASE WHEN v_settings IS NULL OR NOT (v_settings ? 'max_open_cat_b_per_subsystem') THEN 3
                  WHEN jsonb_typeof(v_settings -> 'max_open_cat_b_per_subsystem') = 'number'
                    THEN greatest(0, trunc((v_settings ->> 'max_open_cat_b_per_subsystem')::numeric)::int)
                  ELSE NULL END;
  v_level := CASE WHEN v_cat_a > 0 OR v_total = 0 OR v_approved < v_total OR (v_limit IS NOT NULL AND v_nb > v_limit) THEN 'red'
                  WHEN v_nb > 0 THEN 'yellow' ELSE 'green' END;
  RETURN jsonb_build_object('eligible', v_level, 'totalItrs', v_total, 'approvedItrs', v_approved, 'openCatA', v_cat_a,
    'openCatBPunches', v_cat_b, 'catBLimit', v_limit, 'catBOverLimit', v_limit IS NOT NULL AND v_nb > v_limit);
END;
$function$;
