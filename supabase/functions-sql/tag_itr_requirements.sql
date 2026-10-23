-- fn: public.tag_itr_requirements(uuid,uuid[],uuid[],uuid[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_itr_requirements(p_project_id uuid, p_tag_ids uuid[] DEFAULT NULL::uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(tag_id uuid, template_code text, template_title text, discipline_id uuid, phase_id uuid, origin text, state text, itr_id uuid, itr_status text, reason text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
#variable_conflict use_column
DECLARE v_phases uuid[];
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT array_agg(ph.id) INTO v_phases FROM project_phases ph JOIN projects p ON p.org_id = ph.org_id WHERE p.id = p_project_id;

  RETURN QUERY
  WITH c AS (
    SELECT * FROM public.itr_generation_candidates(p_project_id, COALESCE(v_phases, '{}'), p_system_ids, p_subsystem_ids, p_tag_ids) c
    WHERE c.template_code IS NOT NULL AND c.outcome <> 'out_of_scope'
  ),
  scoped AS (
    SELECT t.id AS tag_id FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id
    WHERE t.project_id = p_project_id
      AND (p_tag_ids IS NULL OR t.id = ANY (p_tag_ids))
      AND (p_subsystem_ids IS NULL OR t.subsystem_id = ANY (p_subsystem_ids))
      AND (p_system_ids IS NULL OR s.system_id = ANY (p_system_ids))
  ),
  itr AS (  -- el mejor ITR de cada tag × código: aprobado > en curso > generado
    SELECT DISTINCT ON (i.tag_id, tp.code) i.tag_id, tp.code, i.id, i.status::text AS status, tp.title, tp.discipline_id, tp.phase_id,
           tp.discipline_id IN (SELECT pd.discipline_id FROM project_disciplines pd WHERE pd.project_id = p_project_id) AS in_scope
    FROM itrs i JOIN itr_templates tp ON tp.id = i.template_id JOIN scoped ON scoped.tag_id = i.tag_id
    WHERE i.project_id = p_project_id
    ORDER BY i.tag_id, tp.code,
             CASE i.status WHEN 'approved' THEN 0 WHEN 'completed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END, i.created_at
  ),
  ov AS (SELECT o.tag_id, o.template_code, o.reason FROM tag_itr_overrides o WHERE o.project_id = p_project_id)
  SELECT c.tag_id, c.template_code, c.template_title, c.discipline_id, c.phase_id, c.origin,
         CASE WHEN c.outcome = 'excluded' THEN 'excluded'
              WHEN itr.id IS NULL THEN 'missing'
              WHEN itr.status = 'approved' THEN 'approved'
              WHEN itr.status = 'not_started' THEN 'generated'
              ELSE 'in_progress' END,
         itr.id, itr.status, ov.reason
  FROM c
  LEFT JOIN itr ON itr.tag_id = c.tag_id AND itr.code = c.template_code
  LEFT JOIN ov ON ov.tag_id = c.tag_id AND ov.template_code = c.template_code
  UNION ALL
  SELECT itr.tag_id, itr.code, itr.title, itr.discipline_id, itr.phase_id, NULL, 'outside', itr.id, itr.status, NULL
  FROM itr
  WHERE itr.in_scope AND NOT EXISTS (SELECT 1 FROM c WHERE c.tag_id = itr.tag_id AND c.template_code = itr.code);
END;
$function$;
