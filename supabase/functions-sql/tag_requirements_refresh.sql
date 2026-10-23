-- fn: public.tag_requirements_refresh(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_refresh(p_project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v_version bigint; v_computed bigint; v_tags uuid[]; v_dirty bigint;
BEGIN
  -- Al leer: true = tag_requirement_rows está al día (se recalcularon los tags sucios); false = hay que calcular en
  -- vivo porque el proyecto espera un recálculo completo (lo hace el cron: a 50.000 tags tarda ~20 s y el rol de
  -- la API corta a los 8 s) o porque otro lo está recalculando en este momento.
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  INSERT INTO tag_requirement_state (project_id) VALUES (p_project_id) ON CONFLICT (project_id) DO NOTHING;
  SELECT s.version, s.computed_version INTO v_version, v_computed
  FROM tag_requirement_state s WHERE s.project_id = p_project_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT count(*) INTO v_dirty FROM tag_requirement_dirty d WHERE d.project_id = p_project_id;
  IF v_computed < v_version OR v_dirty > 2000 THEN
    IF (SELECT count(*) FROM tags t WHERE t.project_id = p_project_id) <= 5000 THEN
      RETURN public.tag_requirements_rebuild(p_project_id);  -- proyecto chico: se recalcula aquí mismo
    END IF;
    IF v_computed >= v_version THEN  -- muchos tags sucios (una importación): que el cron lo haga entero
      UPDATE tag_requirement_state s SET version = s.version + 1 WHERE s.project_id = p_project_id;
    END IF;
    RETURN false;
  END IF;

  IF v_dirty > 0 THEN
    WITH d AS (DELETE FROM tag_requirement_dirty d WHERE d.project_id = p_project_id RETURNING d.tag_id)
    SELECT array_agg(DISTINCT d.tag_id) INTO v_tags FROM d;
    DELETE FROM tag_requirement_rows r WHERE r.project_id = p_project_id AND r.tag_id = ANY (v_tags);
    INSERT INTO tag_requirement_rows (project_id, tag_id, subsystem_id, template_code, template_title, discipline_id, phase_id, origin, state, itr_id, itr_status, reason)
    SELECT p_project_id, q.tag_id, t.subsystem_id, q.template_code, q.template_title, q.discipline_id, q.phase_id, q.origin, q.state, q.itr_id, q.itr_status, q.reason
    FROM public.tag_itr_requirements_core(p_project_id, v_tags) q JOIN tags t ON t.id = q.tag_id;
    UPDATE tag_requirement_state s SET computed_at = now() WHERE s.project_id = p_project_id;
  END IF;
  RETURN true;
END;
$function$;
