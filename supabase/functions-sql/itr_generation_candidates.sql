-- fn: public.itr_generation_candidates(uuid,uuid[],uuid[],uuid[],uuid[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.itr_generation_candidates(p_project_id uuid, p_phase_ids uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(tag_id uuid, tag_number text, subsystem_id uuid, equipment_type_id uuid, template_id uuid, template_code text, template_title text, discipline_id uuid, phase_id uuid, outcome text, origin text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
#variable_conflict use_column
BEGIN
  -- R2b (bench 50k): plpgsql con plan de valores reales (una función LANGUAGE sql planea con parámetros genéricos y
  -- «p_x IS NULL OR …» no se simplifica) y work_mem propio (con los 2 MB por defecto los pares se van a disco).
  RETURN QUERY
  WITH org AS (SELECT org_id FROM projects WHERE id = p_project_id),
    scope AS (
      SELECT t.id, t.tag_number, t.subsystem_id, t.equipment_type_id
      FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id
      WHERE t.project_id = p_project_id
        AND (p_tag_ids IS NULL OR t.id = ANY (p_tag_ids))
        AND (p_subsystem_ids IS NULL OR t.subsystem_id = ANY (p_subsystem_ids))
        AND (p_system_ids IS NULL OR s.system_id = ANY (p_system_ids))
    ),
    active AS (
      SELECT DISTINCT ON (tp.code) tp.id, tp.code, tp.title, tp.discipline_id, tp.phase_id,
             EXISTS (SELECT 1 FROM project_disciplines pd
                     WHERE pd.project_id = p_project_id AND pd.discipline_id = tp.discipline_id) AS in_scope
      FROM itr_templates tp, org
      WHERE tp.org_id = org.org_id AND tp.is_active
        AND NOT EXISTS (SELECT 1 FROM itr_template_items i
                        WHERE i.template_id = tp.id AND i.item_type::text = 'table' AND i.options -> 'rows' ->> 'mode' = 'source')
      ORDER BY tp.code, tp.version DESC, tp.created_at DESC
    ),
    rules AS (
      SELECT DISTINCT m.equipment_type_id, a.id AS template_id, a.code, a.title, a.discipline_id, a.phase_id, a.in_scope
      FROM equipment_type_templates m
      JOIN itr_templates mt ON mt.id = m.itr_template_id
      JOIN active a ON a.code = mt.code
      JOIN org ON m.org_id = org.org_id
      WHERE m.status = 'accepted' AND a.phase_id = ANY (p_phase_ids)
    ),
    ov AS (
      SELECT o.tag_id, o.template_code, o.action FROM tag_itr_overrides o
      WHERE o.project_id = p_project_id AND (p_tag_ids IS NULL OR o.tag_id = ANY (p_tag_ids))
    ),
    -- R2b (bench 50k): «excluido» e «ITR ya existe» por join en vez de subconsultas correlacionadas (con el plan
    -- genérico de la función se ejecutaban por par y el proyecto entero pasaba de 100 s).
    excl AS (SELECT DISTINCT ov.tag_id, ov.template_code FROM ov WHERE ov.action = 'exclude'),
    have AS (
      SELECT DISTINCT i.tag_id, it.code FROM itrs i JOIN itr_templates it ON it.id = i.template_id
      WHERE i.project_id = p_project_id AND i.tag_id IN (SELECT id FROM scope)
    ),
    pairs AS (
      SELECT s.id AS tag_id, r.template_id, r.code, r.title, r.discipline_id, r.phase_id, r.in_scope, 'matrix'::text AS origin
      FROM scope s JOIN rules r ON r.equipment_type_id = s.equipment_type_id
      UNION ALL
      SELECT s.id, a.id, a.code, a.title, a.discipline_id, a.phase_id, a.in_scope, 'manual'::text
      FROM scope s JOIN ov ON ov.tag_id = s.id AND ov.action = 'add'
      JOIN active a ON a.code = ov.template_code AND a.phase_id = ANY (p_phase_ids)
      WHERE NOT EXISTS (SELECT 1 FROM rules r WHERE r.equipment_type_id = s.equipment_type_id AND r.code = a.code)
    )
    SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, p.template_id, p.code, p.title, p.discipline_id, p.phase_id,
           CASE WHEN x.tag_id IS NOT NULL THEN 'excluded'
                WHEN NOT p.in_scope THEN 'out_of_scope'
                WHEN s.subsystem_id IS NULL THEN 'no_subsystem'
                WHEN h.tag_id IS NOT NULL THEN 'exists'
                ELSE 'create' END,
           p.origin
    FROM scope s JOIN pairs p ON p.tag_id = s.id
    LEFT JOIN excl x ON x.tag_id = s.id AND x.template_code = p.code
    LEFT JOIN have h ON h.tag_id = s.id AND h.code = p.code
    UNION ALL
    SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, NULL, NULL, NULL, NULL, NULL,
           CASE WHEN s.equipment_type_id IS NULL THEN 'no_equipment_type' ELSE 'no_rule' END, NULL
    FROM scope s
    WHERE NOT EXISTS (SELECT 1 FROM pairs p WHERE p.tag_id = s.id);
END;
$function$;
