-- fn: public.tag_requirements_rebuild(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_rebuild(p_project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v_version bigint;
BEGIN
  -- Recalcula entero un proyecto (interna: la llaman el cron y tag_requirements_refresh en proyectos chicos).
  -- Si otra transacción lo está recalculando, no espera: devuelve false.
  INSERT INTO tag_requirement_state (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  SELECT s.version INTO v_version FROM tag_requirement_state s WHERE s.project_id = p_project_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM tag_requirement_dirty d WHERE d.project_id = p_project_id;
  DELETE FROM tag_requirement_rows r WHERE r.project_id = p_project_id;
  INSERT INTO tag_requirement_rows (project_id, tag_id, subsystem_id, template_code, template_title, discipline_id, phase_id, origin, state, itr_id, itr_status, reason)
  SELECT p_project_id, q.tag_id, t.subsystem_id, q.template_code, q.template_title, q.discipline_id, q.phase_id, q.origin, q.state, q.itr_id, q.itr_status, q.reason
  FROM public.tag_itr_requirements_core(p_project_id) q JOIN tags t ON t.id = q.tag_id;
  UPDATE tag_requirement_state s SET computed_version = v_version, computed_at = now() WHERE s.project_id = p_project_id;
  RETURN true;
END;
$function$;
