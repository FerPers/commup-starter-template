-- R2b · bench a 50.000 tags (proyecto aparte commup-bench, 2026-10-22; nunca en prod): el registro «Requisitos ITR»
-- sobre el proyecto entero pasaba de 100 s. Tres causas y sus arreglos:
--   1. itr_generation_candidates era LANGUAGE sql: Postgres 17 planea esas funciones con parámetros genéricos y
--      «p_x IS NULL OR …» no se simplifica; las subconsultas correlacionadas (excluido, ITR ya existe) corrían por
--      par. Pasa a plpgsql con plan_cache_mode = force_custom_plan y esas dos comprobaciones van por join.
--   2. work_mem por defecto (2 MB) mandaba a disco los 112 mil pares: las funciones del registro llevan su propio
--      work_mem (32 MB) solo mientras corren.
--   3. La página sin filtro (lo que abre el registro) y «sin tipo» paginan los tags primero y calculan los
--      requisitos solo de la página.
-- tag_itr_requirements resuelve el alcance de disciplinas con un conjunto en vez de un EXISTS por ITR; el Excel y el
-- resumen buscan los tags sin requisitos con NOT IN (subplan con hash): con NOT EXISTS el Excel de un área pasaba de
-- 100 s (bucle anidado sobre la CTE).
-- Mismos resultados; solo cambia cómo se calculan.

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

CREATE OR REPLACE FUNCTION public.tag_requirements_page(p_project_id uuid, p_filter text DEFAULT 'all'::text, p_area_id uuid DEFAULT NULL::uuid, p_system_id uuid DEFAULT NULL::uuid, p_subsystem_id uuid DEFAULT NULL::uuid, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v jsonb; v_systems uuid[]; v_q text := NULLIF(upper(btrim(COALESCE(p_q, ''))), '');
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200); v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_fast boolean := COALESCE(p_filter, 'all') IN ('all', 'notype'); v_page uuid[]; v_total bigint;
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_area_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(s.id), '{}') INTO v_systems FROM systems s WHERE s.project_id = p_project_id AND s.area_id = p_area_id;
  ELSIF p_system_id IS NOT NULL THEN
    v_systems := ARRAY[p_system_id];
  END IF;

  -- R2b (bench 50k): sin filtro o «sin tipo» el filtro no depende de los requisitos: se pagina sobre los tags y
  -- solo se calculan los requisitos de la página (el registro abre así; antes calculaba los 50.000 tags).
  IF v_fast THEN
    WITH t0 AS (
      SELECT t.id, t.tag_number FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id
      WHERE t.project_id = p_project_id
        AND (v_systems IS NULL OR s.system_id = ANY (v_systems))
        AND (p_subsystem_id IS NULL OR t.subsystem_id = p_subsystem_id)
        AND (v_q IS NULL OR upper(t.tag_number) LIKE '%' || v_q || '%' OR upper(COALESCE(t.description, '')) LIKE '%' || v_q || '%')
        AND (COALESCE(p_filter, 'all') <> 'notype' OR t.equipment_type_id IS NULL)
    )
    SELECT (SELECT count(*) FROM t0),
           COALESCE((SELECT array_agg(x.id ORDER BY x.tag_number) FROM (SELECT id, tag_number FROM t0 ORDER BY tag_number LIMIT v_limit OFFSET v_offset) x), '{}')
    INTO v_total, v_page;
  END IF;

  WITH t AS (
    SELECT t.id, t.tag_number, t.description, t.equipment_type_id, et.code AS type_code
    FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id LEFT JOIN equipment_types et ON et.id = t.equipment_type_id
    WHERE t.project_id = p_project_id
      AND (v_systems IS NULL OR s.system_id = ANY (v_systems))
      AND (p_subsystem_id IS NULL OR t.subsystem_id = p_subsystem_id)
      AND (v_q IS NULL OR upper(t.tag_number) LIKE '%' || v_q || '%' OR upper(COALESCE(t.description, '')) LIKE '%' || v_q || '%')
      AND (v_page IS NULL OR t.id = ANY (v_page))
  ),
  r AS (
    SELECT * FROM public.tag_itr_requirements(p_project_id, v_page, v_systems,
      CASE WHEN p_subsystem_id IS NULL THEN NULL ELSE ARRAY[p_subsystem_id] END) r
    WHERE r.tag_id IN (SELECT id FROM t)
  ),
  cc AS (SELECT * FROM public.template_client_codes_for(p_project_id)),
  agg AS (
    SELECT t.id, t.tag_number, t.description, t.type_code, t.equipment_type_id,
           COUNT(r.template_code) AS n,
           COUNT(*) FILTER (WHERE r.state = 'missing') AS missing,
           COUNT(*) FILTER (WHERE r.state = 'excluded') AS excluded,
           COUNT(*) FILTER (WHERE r.state = 'outside') AS outside
    FROM t LEFT JOIN r ON r.tag_id = t.id
    GROUP BY t.id, t.tag_number, t.description, t.type_code, t.equipment_type_id
  ),
  f AS (
    SELECT * FROM agg WHERE CASE COALESCE(p_filter, 'all')
      WHEN 'missing' THEN missing > 0
      WHEN 'notype' THEN equipment_type_id IS NULL
      WHEN 'norule' THEN equipment_type_id IS NOT NULL AND n = 0
      WHEN 'excluded' THEN excluded > 0
      WHEN 'outside' THEN outside > 0
      ELSE true END
  ),
  pg AS (SELECT * FROM f ORDER BY tag_number LIMIT v_limit OFFSET CASE WHEN v_fast THEN 0 ELSE v_offset END)
  SELECT jsonb_build_object(
    'total', COALESCE(v_total, (SELECT count(*) FROM f)),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'tag_id', pg.id, 'tag_number', pg.tag_number, 'description', pg.description, 'type_code', pg.type_code,
        'has_type', pg.equipment_type_id IS NOT NULL,
        'reqs', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', r.template_code, 'title', r.template_title, 'state', r.state,
                            'origin', r.origin, 'itr_id', r.itr_id, 'phase', ph.code, 'reason', r.reason, 'client_code', cc.client_code)
                          ORDER BY ph.order_index NULLS LAST, r.template_code)
                          FROM r LEFT JOIN project_phases ph ON ph.id = r.phase_id LEFT JOIN cc ON cc.template_code = upper(r.template_code)
                          WHERE r.tag_id = pg.id), '[]'::jsonb))
      ORDER BY pg.tag_number) FROM pg), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tag_requirements_summary(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
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
    'tags_no_rule', (SELECT count(*) FROM tg WHERE equipment_type_id IS NOT NULL AND tg.id NOT IN (SELECT r.tag_id FROM r WHERE r.state <> 'outside')),
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

