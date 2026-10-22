-- fn: public.copy_procedure(uuid,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.copy_procedure(p_source_procedure_id uuid, p_target_project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s procedures%ROWTYPE; v_src procedure_revisions%ROWTYPE; v_role text; v_new uuid; v_rev uuid;
BEGIN
  SELECT * INTO s FROM procedures WHERE id = p_source_procedure_id;
  IF NOT FOUND OR NOT public.is_project_member(s.project_id) THEN RAISE EXCEPTION 'Procedimiento de origen no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p_target_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_target_project_id AND org_id = s.org_id) THEN RAISE EXCEPTION 'El proyecto destino es de otra organización' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_src FROM procedure_revisions WHERE id = COALESCE(s.current_revision_id,
    (SELECT id FROM procedure_revisions WHERE procedure_id = s.id ORDER BY rev DESC LIMIT 1));
  v_new := public.create_procedure(p_target_project_id, s.title, s.kind, NULL);
  SELECT id INTO v_rev FROM procedure_revisions WHERE procedure_id = v_new AND rev = 0;
  UPDATE procedure_revisions SET sections = v_src.sections, change_reason = 'Copiado de ' || s.number WHERE id = v_rev;
  INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria,
                               expected_min, expected_max, expected_unit)
  SELECT v_rev, p_target_project_id, st.ord, st.action, st.responsible, st.expected_value,
         (SELECT t2.id FROM tags t1 JOIN tags t2 ON t2.tag_number = t1.tag_number AND t2.project_id = p_target_project_id WHERE t1.id = st.tag_id LIMIT 1),
         st.is_hold_point, st.hold_capacity, st.stop_criteria, st.expected_min, st.expected_max, st.expected_unit
  FROM procedure_steps st WHERE st.revision_id = v_src.id;
  RETURN v_new;
END;
$function$;
