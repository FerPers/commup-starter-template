-- fn: public.itr_generation_summary(uuid,uuid[],uuid[],uuid[],uuid[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.itr_generation_summary(p_project_id uuid, p_phase_ids uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  WITH c AS (SELECT * FROM public.itr_generation_candidates(p_project_id, p_phase_ids, p_system_ids, p_subsystem_ids, p_tag_ids)),
  tags_scope AS (SELECT DISTINCT tag_id FROM c)
  SELECT jsonb_build_object(
    'tags', (SELECT count(*) FROM tags_scope),
    'create', (SELECT count(*) FROM c WHERE outcome = 'create'),
    'exists', (SELECT count(*) FROM c WHERE outcome = 'exists'),
    'no_subsystem', (SELECT count(DISTINCT tag_id) FROM c WHERE outcome = 'no_subsystem'),
    'no_equipment_type', (SELECT count(*) FROM c WHERE outcome = 'no_equipment_type'),
    'no_rule', (SELECT count(*) FROM c WHERE outcome = 'no_rule'),
    'out_of_scope', (SELECT count(*) FROM c WHERE outcome = 'out_of_scope'),
    'excluded', (SELECT count(*) FROM c WHERE outcome = 'excluded'),
    'by_discipline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('discipline_id', x.discipline_id, 'code', d.code, 'name', d.name,
                                          'create', x.n, 'roles', x.roles) ORDER BY d.code NULLS LAST)
      FROM (SELECT c.discipline_id, count(*) AS n,
                   (SELECT array_agg(DISTINCT r ORDER BY r) FROM c c2 JOIN itr_templates tp ON tp.id = c2.template_id
                      LEFT JOIN project_phases ph ON ph.id = tp.phase_id,
                      LATERAL unnest(CASE WHEN COALESCE(ph.itr_client_signature, false) AND NOT ('client' = ANY (tp.required_signatures))
                                          THEN tp.required_signatures || 'client'::text ELSE tp.required_signatures END) r
                     WHERE c2.outcome = 'create' AND c2.discipline_id IS NOT DISTINCT FROM c.discipline_id) AS roles
            FROM c WHERE c.outcome = 'create' GROUP BY c.discipline_id) x
      LEFT JOIN disciplines d ON d.id = x.discipline_id), '[]'::jsonb),
    'by_template', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('code', template_code, 'title', template_title, 'create', cr, 'exists', ex) ORDER BY template_code)
      FROM (SELECT template_code, template_title, count(*) FILTER (WHERE outcome = 'create') cr, count(*) FILTER (WHERE outcome = 'exists') ex
            FROM c WHERE template_code IS NOT NULL GROUP BY 1, 2) t), '[]'::jsonb),
    'samples', jsonb_build_object(
      'no_equipment_type', COALESCE((SELECT jsonb_agg(tag_number ORDER BY tag_number) FROM (SELECT tag_number FROM c WHERE outcome = 'no_equipment_type' ORDER BY tag_number LIMIT 20) s), '[]'),
      'no_rule', COALESCE((SELECT jsonb_agg(tag_number ORDER BY tag_number) FROM (SELECT tag_number FROM c WHERE outcome = 'no_rule' ORDER BY tag_number LIMIT 20) s), '[]'),
      'out_of_scope', COALESCE((SELECT jsonb_agg(template_code ORDER BY template_code) FROM (SELECT DISTINCT template_code FROM c WHERE outcome = 'out_of_scope' ORDER BY template_code LIMIT 20) s), '[]'),
      'no_subsystem', COALESCE((SELECT jsonb_agg(DISTINCT tag_number) FROM (SELECT tag_number FROM c WHERE outcome = 'no_subsystem' ORDER BY tag_number LIMIT 20) s), '[]'))
  ) INTO v;
  RETURN v;
END;
$function$;
