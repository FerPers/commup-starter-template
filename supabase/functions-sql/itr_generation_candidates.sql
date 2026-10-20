-- fn: public.itr_generation_candidates(uuid,uuid[],uuid[],uuid[],uuid[])
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.itr_generation_candidates(p_project_id uuid, p_phase_ids uuid[], p_system_ids uuid[] DEFAULT NULL::uuid[], p_subsystem_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(tag_id uuid, tag_number text, subsystem_id uuid, equipment_type_id uuid, template_id uuid, template_code text, template_title text, discipline_id uuid, phase_id uuid, outcome text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    SELECT DISTINCT ON (tp.code) tp.id, tp.code, tp.title, tp.discipline_id, tp.phase_id
    FROM itr_templates tp, org
    WHERE tp.org_id = org.org_id AND tp.is_active
      AND NOT EXISTS (SELECT 1 FROM itr_template_items i
                      WHERE i.template_id = tp.id AND i.item_type::text = 'table' AND i.options -> 'rows' ->> 'mode' = 'source')
    ORDER BY tp.code, tp.version DESC, tp.created_at DESC
  ),
  rules AS (
    SELECT DISTINCT m.equipment_type_id, a.id AS template_id, a.code, a.title, a.discipline_id, a.phase_id
    FROM equipment_type_templates m
    JOIN itr_templates mt ON mt.id = m.itr_template_id
    JOIN active a ON a.code = mt.code
    JOIN org ON m.org_id = org.org_id
    WHERE m.status = 'accepted' AND a.phase_id = ANY (p_phase_ids)
  )
  SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, r.template_id, r.code, r.title, r.discipline_id, r.phase_id,
         CASE WHEN s.subsystem_id IS NULL THEN 'no_subsystem'
              WHEN EXISTS (SELECT 1 FROM itrs i JOIN itr_templates it ON it.id = i.template_id
                           WHERE i.tag_id = s.id AND it.code = r.code) THEN 'exists'
              ELSE 'create' END
  FROM scope s JOIN rules r ON r.equipment_type_id = s.equipment_type_id
  UNION ALL
  SELECT s.id, s.tag_number, s.subsystem_id, s.equipment_type_id, NULL, NULL, NULL, NULL, NULL,
         CASE WHEN s.equipment_type_id IS NULL THEN 'no_equipment_type' ELSE 'no_rule' END
  FROM scope s
  WHERE NOT EXISTS (SELECT 1 FROM rules r WHERE r.equipment_type_id = s.equipment_type_id);
$function$;
