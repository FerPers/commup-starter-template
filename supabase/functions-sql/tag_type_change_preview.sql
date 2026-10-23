-- fn: public.tag_type_change_preview(uuid,uuid[],uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_type_change_preview(p_project_id uuid, p_tag_ids uuid[], p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v_org uuid; v_res jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM equipment_types WHERE id = p_type_id AND org_id = v_org) THEN
    RAISE EXCEPTION 'equipment_type_not_found' USING ERRCODE = '22023';
  END IF;

  WITH scope AS (
    SELECT t.id, t.equipment_type_id AS old_type FROM tags t
    WHERE t.project_id = p_project_id AND t.id = ANY (COALESCE(p_tag_ids, '{}'))
  ),
  active AS (
    SELECT DISTINCT ON (tp.code) tp.code,
           EXISTS (SELECT 1 FROM project_disciplines pd WHERE pd.project_id = p_project_id AND pd.discipline_id = tp.discipline_id) AS in_scope
    FROM itr_templates tp
    WHERE tp.org_id = v_org AND tp.is_active
      AND tp.phase_id IN (SELECT ph.id FROM project_phases ph WHERE ph.org_id = v_org)
      AND NOT EXISTS (SELECT 1 FROM itr_template_items i
                      WHERE i.template_id = tp.id AND i.item_type::text = 'table' AND i.options -> 'rows' ->> 'mode' = 'source')
    ORDER BY tp.code, tp.version DESC, tp.created_at DESC
  ),
  rules AS (
    SELECT DISTINCT m.equipment_type_id, a.code
    FROM equipment_type_templates m
    JOIN itr_templates mt ON mt.id = m.itr_template_id
    JOIN active a ON a.code = mt.code AND a.in_scope
    WHERE m.org_id = v_org AND m.status = 'accepted'
      AND (m.equipment_type_id = p_type_id OR m.equipment_type_id IN (SELECT old_type FROM scope))
  ),
  ov AS (SELECT o.tag_id, o.template_code, o.action FROM tag_itr_overrides o JOIN scope s ON s.id = o.tag_id),
  req AS (
    SELECT s.id AS tag_id, r.code, 'old'::text AS w FROM scope s JOIN rules r ON r.equipment_type_id = s.old_type
    UNION
    SELECT s.id, r.code, 'new' FROM scope s JOIN rules r ON r.equipment_type_id = p_type_id
    UNION
    SELECT ov.tag_id, a.code, v.w FROM ov JOIN active a ON a.code = ov.template_code AND a.in_scope
    CROSS JOIN (VALUES ('old'), ('new')) v(w) WHERE ov.action = 'add'
  ),
  r2 AS (
    SELECT req.* FROM req
    WHERE NOT EXISTS (SELECT 1 FROM ov WHERE ov.tag_id = req.tag_id AND ov.template_code = req.code AND ov.action = 'exclude')
  ),
  pairs AS (
    SELECT tag_id, code, bool_or(w = 'old') AS was, bool_or(w = 'new') AS will FROM r2 GROUP BY 1, 2
  ),
  have AS (
    SELECT i.tag_id, it.code, bool_or(i.status::text IN ('completed', 'approved')) AS signed
    FROM itrs i JOIN itr_templates it ON it.id = i.template_id JOIN scope s ON s.id = i.tag_id
    WHERE i.project_id = p_project_id GROUP BY 1, 2
  ),
  x AS (
    SELECT p.tag_id, p.code, p.was, p.will, h.tag_id IS NOT NULL AS has_itr, COALESCE(h.signed, false) AS signed
    FROM pairs p LEFT JOIN have h ON h.tag_id = p.tag_id AND h.code = p.code
  ),
  -- ITR que hoy cuentan como requeridos y con el tipo nuevo quedan «fuera de requisitos».
  outside AS (SELECT * FROM x WHERE x.was AND NOT x.will AND x.has_itr)
  SELECT jsonb_build_object(
    'tags', (SELECT count(*) FROM scope),
    'changed', (SELECT count(*) FROM scope WHERE old_type IS DISTINCT FROM p_type_id),
    'required_before', (SELECT count(*) FROM x WHERE was),
    'required_after', (SELECT count(*) FROM x WHERE will),
    'gain', (SELECT count(*) FROM x WHERE will AND NOT was),
    'gain_to_generate', (SELECT count(*) FROM x WHERE will AND NOT was AND NOT has_itr),
    'gain_codes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'n', n) ORDER BY code), '[]')
                   FROM (SELECT code, count(*)::int n FROM x WHERE will AND NOT was GROUP BY code) z),
    'dropped', (SELECT count(*) FROM x WHERE was AND NOT will AND NOT has_itr),
    'outside', (SELECT count(*) FROM outside),
    'outside_signed', (SELECT count(*) FROM outside WHERE signed),
    'outside_codes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'n', n) ORDER BY code), '[]')
                      FROM (SELECT code, count(*)::int n FROM outside GROUP BY code) z),
    'type_rules', (SELECT count(DISTINCT code) FROM rules WHERE equipment_type_id = p_type_id)
  ) INTO v_res;
  RETURN v_res;
END;
$function$;
