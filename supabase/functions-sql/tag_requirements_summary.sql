-- fn: public.tag_requirements_summary(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_summary(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; v_org uuid;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;

  WITH r AS (SELECT * FROM public.tag_itr_requirements(p_project_id)),
  req AS (SELECT * FROM r WHERE r.state NOT IN ('excluded', 'outside')),
  tg AS (
    SELECT t.id, t.subsystem_id, t.equipment_type_id FROM tags t WHERE t.project_id = p_project_id
  )
  SELECT jsonb_build_object(
    'required', (SELECT count(*) FROM req),
    'generated', (SELECT count(*) FROM req WHERE state <> 'missing'),
    'in_progress', (SELECT count(*) FROM req WHERE state = 'in_progress'),
    'approved', (SELECT count(*) FROM req WHERE state = 'approved'),
    'missing', (SELECT count(*) FROM req WHERE state = 'missing'),
    'excluded', (SELECT count(*) FROM r WHERE state = 'excluded'),
    'outside', (SELECT count(*) FROM r WHERE state = 'outside'),
    'tags', (SELECT count(*) FROM tg),
    'tags_no_type', (SELECT count(*) FROM tg WHERE equipment_type_id IS NULL),
    'tags_no_rule', (SELECT count(*) FROM tg WHERE equipment_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM r WHERE r.tag_id = tg.id AND r.state <> 'outside')),
    'proposed_rules', (SELECT count(*) FROM equipment_type_templates m WHERE m.org_id = v_org AND m.status = 'proposed'),
    'by_subsystem', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('subsystem_id', x.subsystem_id, 'required', x.required, 'missing', x.missing))
      FROM (SELECT tg.subsystem_id, count(req.*) AS required, count(*) FILTER (WHERE req.state = 'missing') AS missing
            FROM req JOIN tg ON tg.id = req.tag_id GROUP BY tg.subsystem_id) x), '[]'::jsonb),
    'by_discipline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('discipline_id', x.discipline_id, 'code', d.code, 'name', d.name, 'color', d.color,
                                          'required', x.required, 'generated', x.generated, 'approved', x.approved, 'missing', x.missing) ORDER BY d.code)
      FROM (SELECT req.discipline_id, count(*) AS required, count(*) FILTER (WHERE state <> 'missing') AS generated,
                   count(*) FILTER (WHERE state = 'approved') AS approved, count(*) FILTER (WHERE state = 'missing') AS missing
            FROM req GROUP BY req.discipline_id) x LEFT JOIN disciplines d ON d.id = x.discipline_id), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;
