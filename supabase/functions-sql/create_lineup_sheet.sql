-- fn: public.create_lineup_sheet(uuid,uuid,text,text,uuid,boolean)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.create_lineup_sheet(p_project_id uuid, p_system_id uuid, p_title text, p_purpose text DEFAULT 'startup'::text, p_procedure_id uuid DEFAULT NULL::uuid, p_generate boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_org uuid; v_seq integer; v_id uuid;
BEGIN
  v_role := public.register_caller_role(p_project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_system_id IS NULL THEN RAISE EXCEPTION 'El line-up necesita un sistema' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(p_project_id, v_org, p_system_id, NULL);
  IF p_procedure_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM procedures WHERE id = p_procedure_id AND project_id = p_project_id) THEN
    RAISE EXCEPTION 'El procedimiento no pertenece al proyecto' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  v_seq := public.mgmt_next_seq('lineup_sheets', p_project_id);
  INSERT INTO lineup_sheets (org_id, project_id, seq, number, system_id, title, purpose, procedure_id, created_by)
  VALUES (v_org, p_project_id, v_seq, 'LU-' || lpad(v_seq::text, 4, '0'), p_system_id, public.mgmt_text(p_title, 200), COALESCE(p_purpose, 'startup'), p_procedure_id, auth.uid())
  RETURNING id INTO v_id;
  IF COALESCE(p_generate, true) THEN
    INSERT INTO lineup_items (sheet_id, project_id, ord, tag_id, is_critical)
    -- S25 (E-29): candidatas y críticas por los flags del tipo de equipo (no por el nombre de la categoría); orden
    -- de recorrido por P&ID y luego tag.
    SELECT v_id, p_project_id, row_number() OVER (ORDER BY t.pid_drawing NULLS LAST, t.tag_number), t.id, et.critical_valve
    FROM tags t JOIN subsystems ss ON ss.id = t.subsystem_id
    JOIN equipment_types et ON et.id = t.equipment_type_id
    WHERE ss.system_id = p_system_id AND t.project_id = p_project_id AND et.lineup_candidate;
  END IF;
  RETURN v_id;
END;
$function$;
