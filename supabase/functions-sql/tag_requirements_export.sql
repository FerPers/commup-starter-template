-- fn: public.tag_requirements_export(uuid,uuid,uuid,uuid,integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_export(p_project_id uuid, p_area_id uuid DEFAULT NULL::uuid, p_system_id uuid DEFAULT NULL::uuid, p_subsystem_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v jsonb; v_org uuid; v_systems uuid[]; v_subs uuid[]; v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20000), 1), 50000);
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;
  IF p_area_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(s.id), '{}') INTO v_systems FROM systems s WHERE s.project_id = p_project_id AND s.area_id = p_area_id;
  ELSIF p_system_id IS NOT NULL THEN
    v_systems := ARRAY[p_system_id];
  END IF;
  IF p_subsystem_id IS NOT NULL THEN v_subs := ARRAY[p_subsystem_id]; END IF;

  WITH r AS MATERIALIZED (SELECT * FROM public.tag_itr_requirements(p_project_id, NULL, v_systems, v_subs)),
  tg AS MATERIALIZED (
    SELECT t.id, t.tag_number, t.description, t.equipment_type_id, et.code AS type_code, t.subsystem_id,
           ar.code AS area_code, sy.code AS system_code, sy.name AS system_name, sb.code AS subsystem_code, sb.name AS subsystem_name
    FROM tags t
    LEFT JOIN subsystems sb ON sb.id = t.subsystem_id
    LEFT JOIN systems sy ON sy.id = sb.system_id
    LEFT JOIN areas ar ON ar.id = sy.area_id
    LEFT JOIN equipment_types et ON et.id = t.equipment_type_id
    WHERE t.project_id = p_project_id
      AND (v_systems IS NULL OR sb.system_id = ANY (v_systems))
      AND (v_subs IS NULL OR t.subsystem_id = ANY (v_subs))
  ),
  cc AS (SELECT * FROM public.template_client_codes_for(p_project_id)),
  req AS (SELECT * FROM r WHERE r.state NOT IN ('excluded', 'outside')),
  bare AS (  -- tags sin requisitos: sin tipo o sin regla (los que solo tienen ITR fuera de requisitos cuentan como sin regla)
    SELECT tg.* FROM tg WHERE tg.id NOT IN (SELECT r.tag_id FROM r WHERE r.state <> 'outside')  -- subplan con hash
  ),
  det AS (
    SELECT tg.tag_number, ph.order_index, r.template_code AS code,
           jsonb_build_array(tg.area_code, tg.system_code, tg.subsystem_code, tg.tag_number, tg.description, tg.type_code,
                             d.code, ph.code, r.template_code, cc.client_code, r.template_title, r.state, r.origin, i.itr_number, r.reason) AS row
    FROM r JOIN tg ON tg.id = r.tag_id
    LEFT JOIN disciplines d ON d.id = r.discipline_id
    LEFT JOIN project_phases ph ON ph.id = r.phase_id
    LEFT JOIN cc ON cc.template_code = upper(r.template_code)
    LEFT JOIN itrs i ON i.id = r.itr_id
    UNION ALL
    SELECT b.tag_number, NULL, NULL,
           jsonb_build_array(b.area_code, b.system_code, b.subsystem_code, b.tag_number, b.description, b.type_code,
                             NULL, NULL, NULL, NULL, NULL, CASE WHEN b.equipment_type_id IS NULL THEN 'no_type' ELSE 'no_rule' END, NULL, NULL, NULL)
    FROM bare b
  )
  SELECT jsonb_build_object(
    'tags', (SELECT count(*) FROM tg),
    'tags_no_type', (SELECT count(*) FROM bare WHERE equipment_type_id IS NULL),
    'tags_no_rule', (SELECT count(*) FROM bare WHERE equipment_type_id IS NOT NULL),
    'proposed_rules', (SELECT count(*) FROM equipment_type_templates m WHERE m.org_id = v_org AND m.status = 'proposed'),
    'by_discipline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'required', x.required, 'generated', x.generated,
                                          'in_progress', x.in_progress, 'approved', x.approved, 'missing', x.missing,
                                          'excluded', x.excluded, 'outside', x.outside) ORDER BY d.code NULLS LAST)
      FROM (SELECT r.discipline_id,
                   count(*) FILTER (WHERE r.state NOT IN ('excluded', 'outside')) AS required,
                   count(*) FILTER (WHERE r.state IN ('generated', 'in_progress', 'approved')) AS generated,
                   count(*) FILTER (WHERE r.state = 'in_progress') AS in_progress,
                   count(*) FILTER (WHERE r.state = 'approved') AS approved,
                   count(*) FILTER (WHERE r.state = 'missing') AS missing,
                   count(*) FILTER (WHERE r.state = 'excluded') AS excluded,
                   count(*) FILTER (WHERE r.state = 'outside') AS outside
            FROM r GROUP BY r.discipline_id) x
      LEFT JOIN disciplines d ON d.id = x.discipline_id), '[]'::jsonb),
    'by_stage', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(x.system_code, x.system_name, x.subsystem_code, x.subsystem_name, x.disc, x.phase, x.phase_name,
                                         x.required, x.generated, x.in_progress, x.approved, x.missing)
                       ORDER BY x.system_code NULLS LAST, x.subsystem_code NULLS LAST, x.disc NULLS LAST, x.ord NULLS LAST)
      FROM (SELECT tg.system_code, tg.system_name, tg.subsystem_code, tg.subsystem_name, d.code AS disc, ph.code AS phase, ph.name AS phase_name,
                   ph.order_index AS ord, count(*) AS required,
                   count(*) FILTER (WHERE req.state <> 'missing') AS generated,
                   count(*) FILTER (WHERE req.state = 'in_progress') AS in_progress,
                   count(*) FILTER (WHERE req.state = 'approved') AS approved,
                   count(*) FILTER (WHERE req.state = 'missing') AS missing
            FROM req JOIN tg ON tg.id = req.tag_id
            LEFT JOIN disciplines d ON d.id = req.discipline_id
            LEFT JOIN project_phases ph ON ph.id = req.phase_id
            GROUP BY tg.system_code, tg.system_name, tg.subsystem_code, tg.subsystem_name, d.code, ph.code, ph.name, ph.order_index) x), '[]'::jsonb),
    'detail_total', (SELECT count(*) FROM det),
    'detail', COALESCE((
      SELECT jsonb_agg(s.row ORDER BY s.tag_number, s.order_index NULLS LAST, s.code NULLS LAST)
      FROM (SELECT * FROM det ORDER BY tag_number, order_index NULLS LAST, code NULLS LAST LIMIT v_limit) s), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;
